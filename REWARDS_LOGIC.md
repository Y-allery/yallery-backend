# Логіка ревардів (нагород) в системі - Детальний аналіз

## Огляд

Система має кілька типів ревардів, які користувачі можуть отримувати за різні дії. Всі реварди зберігаються як YEPs (очки) та відстежуються через систему активностей.

---

## 1. DAILY_REWARD (Щоденна нагорода)

### Опис
Користувачі можуть отримувати щоденну нагороду один раз на день.

### Логіка
- **Файл**: `src/activity/activity.service.ts` - метод `claimDailyReward()`
- **Endpoint**: `POST /activity/claim-daily-reward`
- **Перевірка**: Перевіряється, чи користувач вже отримав нагороду сьогодні через `hasReceivedDailyRewardToday()`
- **Сума**: Змінна середовища `DAILY_REWARD_YEPS`
- **Обмеження**: Один раз на день (перевірка по `createdAt` між початком і кінцем дня)

### Процес
1. Перевірка, чи вже отримано сьогодні (через запит до `activity` таблиці)
2. Якщо ні - створюється активність типу `DAILY_REWARD`
3. Додаються понти користувачу через `userRepository.increment()`
4. Відправляється повідомлення через WebSocket
5. Повертається `{ success: boolean, message: string, pointsAwarded: number }`

### Додаткова логіка (застаріла/конфліктна)
- **Файл**: `src/user/user.service.ts` - метод `handleDailyReward()`
- Викликається через cron job (не вказано коли)
- Нагороджує всіх користувачів, які оновилися сьогодні (`updatedAt >= todayStart`)
- **⚠️ КРИТИЧНА ПРОБЛЕМА**: Може конфліктувати з `claimDailyReward()` та нагороджувати користувачів двічі

---

## 2. LIKE_EARN / LIKE_SPEND (Нагорода за лайки)

### Опис
Коли користувач лайкає пост іншого користувача:
- **Лайкер** витрачає понти (`LIKE_SPEND`)
- **Автор поста** отримує понти (`LIKE_EARN`)

### Логіка
- **Файл**: `src/like/like.service.ts` - метод `createLike()`
- **Endpoint**: `POST /like`
- **Витрата**: Змінна середовища `LIKE_SPEND_YEPS` (за замовчуванням 15)
- **Нагорода**: Змінна середовища `LIKE_EARN_YEPS`
- **Мінімум для лайку**: Користувач повинен мати мінімум 15 понтів

### Процес
1. Перевірка, чи користувач не лайкає свій власний пост
2. Перевірка достатності понтів (>= 15)
3. Перевірка, чи пост ще не лайкнутий
4. **Транзакція** (всі операції атомарні):
   - Створюється лайк
   - Лайкер втрачає `LIKE_SPEND_YEPS` понтів (через `decrement` з умовою `points >= 15`)
   - Автор поста отримує `LIKE_EARN_YEPS` понтів (через `increment`)
5. Створюються дві активності (для лайкера і автора)
6. Відправляються повідомлення обом користувачам через WebSocket
7. Відправляються push-нотифікації (якщо увімкнені)

### Важливо
- Використовується транзакція для гарантії атомарності
- Перевірка мінімального балансу в базі даних (`MoreThanOrEqual(15)`)

---

## 3. SHARE_REWARD (Нагорода за шаринг)

### Опис
Існує два типи нагород за шаринг:

#### 3.1. Share Post Reward
- **Файл**: `src/post/post.service.ts` - метод `share()`
- **Endpoint**: `POST /post/share`
- **Сума**: Змінна середовища `SHARE_YEPS` (за замовчуванням 5)
- **Обмеження**: Один раз на день (перевірка через `user.lastShareRewardAt`)
- **Процес**: 
  - Користувач отримує понти за шаринг поста
  - Оновлюється `lastShareRewardAt`
  - Відправляється повідомлення через WebSocket

#### 3.2. Referral Reward (Invite Reward)
- **Файл**: `src/user/user.service.ts` - метод `useReferralCode()`
- **Endpoint**: `POST /user/use-referral-code`
- **Сума**: Фіксована - **500 YEPs** для обох користувачів
- **Процес**: 
  - Коли новий користувач використовує реферальний код
  - Обидва користувачі (новий і рефер) отримують по 500 YEPs
  - Створюються активності типу `SHARE_REWARD` для обох
- **⚠️ КРИТИЧНИЙ БАГ**: Обидві активності створюються для одного користувача (`user.id`), а не для рефера (`referral.user.id`)

**Код з багом:**
```typescript
const userReward = await this.activityService.createActivities(
  user.id,        // ❌ Помилка: має бути null
  [user.id],      // ✅ Правильно
  ActivityEnum.SHARE_REWARD,
);

const refferalUserReward = await this.activityService.createActivities(
  user.id,        // ❌ Помилка: має бути user.id
  [user.id],      // ❌ Помилка: має бути [referral.user.id]
  ActivityEnum.SHARE_REWARD,
);
```

---

## 4. CONTEST_WIN (Нагорода за перемогу в конкурсі)

### Опис
Користувач отримує нагороду за перемогу в конкурсі.

### Логіка
- **Файл**: `src/contest/contest.service.ts` - метод `setContestWinner()`
- **Endpoint**: `POST /admin/contest/set-winner` (тільки для адмінів)
- **Сума**: Динамічна - береться з `contest.reward`
- **Умови**:
  - Конкурс повинен бути в статусі `PENDING_REVIEW`
  - Пост повинен бути опублікований і не заблокований
  - Для FINE_TUNE конкурсів - перевірка ретвіту в Twitter через Tweetscout API

### Процес
1. Адмін встановлює переможця конкурсу
2. Перевірка умов (ретвіт для FINE_TUNE через `checkRetweet()`)
3. Оновлення конкурсу (статус `CLOSED`, `is_approved = true`)
4. Додавання понтів переможцю: `post.user.points += contest.reward`
5. Створення активності `CONTEST_WIN` для переможця
6. Створення адмін-активності `ADMIN_CONTEST_WON`
7. Видалення старої адмін-активності `ADMIN_CONTEST_REVIEW`
8. Відправка повідомлень та push-нотифікацій

---

## 5. TOP_POST_REWARD_AUTHOR / TOP_POST_REWARD_LIKER (Нагорода за топ-пост)

### Опис
Система нагороджує найпопулярніші пости в кожному тегу щодня.

### Логіка
- **Файл**: `src/user/user.service.ts` - метод `processTopLikedPostRewards()`
- **Cron**: Викликається щодня о 2:00 ночі (`@Cron('0 2 * * *')`)
- **Файл контролера**: `src/user/user.controller.ts` - метод `handleTopLikedPostReward()`

### Алгоритм розподілу нагороди
1. Для кожного тегу знаходиться топ-пост (найбільше лайків)
2. Пост не повинен мати `hasWonDailyReward = true`
3. Розрахунок нагороди:
   - `rewardPool = likeCount` (кількість лайків)
   - `authorReward = Math.floor(rewardPool / 2)` (50% автору)
   - `usersReward = rewardPool - authorReward` (50% лайкерам)
   - `userRewardEach = Math.floor(usersReward / likes.length)` (рівномірно між лайкерами)

### Нагороди
- **Автор**: Фіксовано **100 YEPs** (незалежно від розрахунку `authorReward`!)
- **Лайкери**: `userRewardEach` YEPs кожному (розраховано правильно)

### Процес
1. Для кожного тегу знаходиться топ-пост
2. Якщо лайків > 0:
   - Автор отримує 100 YEPs (фіксована сума)
   - Всі лайкери отримують рівну частку від 50% пулу
3. Пост позначається як `hasWonDailyReward = true`
4. Створюються активності для автора (`TOP_POST_REWARD_AUTHOR`) та всіх лайкерів (`TOP_POST_REWARD_LIKER`)

### ⚠️ КРИТИЧНА ПРОБЛЕМА
Автор завжди отримує 100 YEPs, навіть якщо розрахунок `authorReward` дає менше. Це може призвести до:
- Дисбалансу в системі (більше понтів виплачується, ніж збирається)
- Несправедливості (автор отримує більше, ніж має)

**Рекомендація**: Використовувати `authorReward` замість фіксованих 100 YEPs.

---

## 6. IMAGE_GENERATE_SPEND / VIDEO_GENERATE_SPEND (Витрати на генерацію)

### Опис
Користувачі витрачають понти на генерацію зображень та відео.

### Логіка генерації зображень
- **Файл**: `src/image-generation/image-generation.service.ts`
- **Endpoints**: 
  - `POST /image-generation/generate` - генерація зображень
  - `POST /image-generation/edit` - редагування зображень
- **Розрахунок вартості**: 
  - Метод `calculateTotalCost(service: AIEnum, quantity: number)`
  - Вартість береться з таблиці `ai_settings` (поле `cost`)
  - `totalCost = costPerImage * quantity`
- **Перевірка балансу**: `verifyUserHasEnoughCredits()` перед генерацією
- **Віднімання понтів**: `user.points -= cost` в методі `updateUserCredits()`

### Логіка генерації відео
- **Файл**: `src/video-generation/video-generation.service.ts`
- **Endpoint**: `POST /video-generation/generate`
- **Вартість**: Фіксована - **100 YEPs** за одне відео
- **Віднімання понтів**: `user.points -= 100` в методі `updateUserCredits()`

### Процес
1. Користувач ініціює генерацію
2. Розраховується вартість на основі сервісу та параметрів
3. Перевірка достатності понтів
4. Віднімання понтів
5. Створення активності типу `IMAGE_GENERATE_SPEND` або `VIDEO_GENERATE_SPEND`
6. Відправка повідомлення через WebSocket

### Refund Credits (Повернення понтів)
- **Файл**: `src/image-generation/image-generation.service.ts` - метод `calculateRefundCredits()`
- **Endpoint**: `POST /image-generation/refund-credits`
- **Процес**:
  - Користувач може повернути понти за невдалі генерації
  - Розраховується сума повернення на основі `aiService` та кількості постів
  - Понти додаються назад: `user.points += totalRefund`
  - **⚠️ НЕ СТВОРЮЄТЬСЯ АКТИВНІСТЬ** для повернення (можлива проблема для аудиту)

---

## 7. Payment Rewards (Нагороди за покупки)

### Опис
Користувачі можуть купувати понти через платіжну систему.

### Логіка
- **Файл**: `src/payment/payment.service.ts` - метод `processWebhook()`
- **Endpoint**: `POST /payment/webhook` (викликається зовнішньою системою)
- **Продукти**:
  - `5000yeps` → 5000 YEPs
  - `15000yeps` → 15000 YEPs
  - `30000yeps` → 30000 YEPs

### Процес
1. Отримання webhook від платіжної системи
2. Перевірка типу події (`non_subscription_purchase`)
3. Визначення кількості понтів за `productId`
4. Додавання понтів користувачу: `user.points += pointsToAdd`
5. Збереження запису про платіж в таблицю `payments`
6. Оновлення профілю через WebSocket
7. **⚠️ НЕ СТВОРЮЄТЬСЯ АКТИВНІСТЬ** для покупки (можлива проблема для аудиту)

---

## Змінні середовища (Environment Variables)

Всі суми ревардів налаштовуються через змінні середовища:

```env
DAILY_REWARD_YEPS=10          # Щоденна нагорода
LIKE_EARN_YEPS=5              # Нагорода за отримання лайку
LIKE_SPEND_YEPS=15            # Витрата за лайк
SHARE_YEPS=5                  # Нагорода за шаринг поста
SHARE_REWARD_YEPS=500         # Нагорода за реферал (відображається в повідомленнях)
IMAGE_GENERATE_COST_YEPS=50   # Вартість генерації зображення (для повідомлень, не використовується)
VIDEO_GENERATE_COST_YEPS=100  # Вартість генерації відео (для повідомлень)
```

**Важливо**: Реальна вартість генерації зображень береться з таблиці `ai_settings`, а не з змінних середовища!

---

## Типи активностей (ActivityEnum)

Всі реварди відстежуються через систему активностей:

```typescript
export enum ActivityEnum {
  LIKE_EARN = 'LIKE_EARN',                    // Отримано за лайк
  LIKE_SPEND = 'LIKE_SPEND',                  // Витрачено на лайк
  IMAGE_GENERATE_SPEND = 'IMAGE_GENERATE_SPEND',  // Витрачено на генерацію зображення
  VIDEO_GENERATE_SPEND = 'VIDEO_GENERATE_SPEND',   // Витрачено на генерацію відео
  CONTEST_WIN = 'CONTEST_WIN',                // Перемога в конкурсі
  DAILY_REWARD = 'DAILY_REWARD',              // Щоденна нагорода
  SHARE_REWARD = 'SHARE_REWARD',              // Нагорода за шаринг/реферал
  TOP_POST_REWARD_AUTHOR = 'TOP_POST_REWARD_AUTHOR',  // Нагорода автору топ-поста
  TOP_POST_REWARD_LIKER = 'TOP_POST_REWARD_LIKER',    // Нагорода лайкеру топ-поста
  // ... інші адмін-активності
}
```

---

## Cron Jobs (Автоматичні реварди)

### 1. Daily Reward (застарілий/конфліктний)
- **Файл**: `src/user/user.controller.ts`
- **Метод**: `handleDailyReward()` → `userService.handleDailyReward()`
- **Cron**: Не вказано (можливо викликається вручну)
- **Логіка**: Нагороджує всіх активних користувачів (ті, що оновилися сьогодні)
- **⚠️ ПРОБЛЕМА**: Конфліктує з ручним `claimDailyReward()`

### 2. Top Post Rewards
- **Файл**: `src/user/user.controller.ts`
- **Метод**: `handleTopLikedPostReward()` → `userService.processTopLikedPostRewards()`
- **Cron**: `@Cron('0 2 * * *')` - щодня о 2:00 ночі
- **Логіка**: Нагороджує топ-пости в кожному тегу

---

## Потенційні проблеми та рекомендації

### 1. ⚠️ КРИТИЧНА: Конфлікт Daily Reward
- Існують два методи для щоденної нагороди: `claimDailyReward()` (ручний) та `handleDailyReward()` (автоматичний)
- **Рекомендація**: 
  - Видалити `handleDailyReward()` або змінити логіку
  - Залишити тільки ручний виклик через API

### 2. ⚠️ КРИТИЧНИЙ БАГ: Referral Reward
- В `useReferralCode()` обидві активності створюються для `user.id`, а не для `referral.user.id`
- **Рекомендація**: 
```typescript
// Виправити на:
const refferalUserReward = await this.activityService.createActivities(
  user.id,                    // fromUserId
  [referral.user.id],         // toUserIds - виправити!
  ActivityEnum.SHARE_REWARD,
);
```

### 3. ⚠️ КРИТИЧНА ПРОБЛЕМА: Фіксована нагорода для автора топ-поста
- Автор завжди отримує 100 YEPs, навіть якщо розрахунок дає менше
- **Рекомендація**: 
```typescript
// Замість:
.set({ points: () => `points + ${100}` })

// Використовувати:
.set({ points: () => `points + ${authorReward}` })
```

### 4. ⚠️ Відсутність активностей для важливих операцій
- **Payment**: Покупка понтів не створює активність
- **Refund**: Повернення понтів не створює активність
- **Рекомендація**: Додати нові типи активностей або використати існуючі

### 5. ⚠️ Відсутність обмежень
- Немає обмежень на кількість рефералів
- Немає обмежень на кількість топ-постів на день
- **Рекомендація**: Додати обмеження для запобігання зловживанням

### 6. ⚠️ Непослідовність у вартості генерації
- Для зображень: вартість з `ai_settings` таблиці
- Для відео: фіксована 100 YEPs
- **Рекомендація**: Уніфікувати підхід (використовувати таблицю для обох)

### 7. ⚠️ Потенційна проблема з транзакціями
- Тільки `createLike()` використовує транзакції
- Інші операції з понтами не використовують транзакції
- **Рекомендація**: Додати транзакції для всіх операцій з понтами

---

## Структура даних

### Activity Entity
- Зберігає всі активності користувачів
- Поля: `activityType`, `points`, `description`, `fromUser`, `toUser`, `post`, `contest`, `isRead`, `is_admin`
- Використовується для історії транзакцій та статистики

### User Entity
- Поле `points` - поточний баланс користувача
- Поле `lastShareRewardAt` - останній час отримання нагороди за шаринг
- Поле `bonusEligible` - чи може отримати бонус (використовується в рефералах)

### Post Entity
- Поле `hasWonDailyReward` - чи пост вже отримав нагороду за топ-пост

### AI Settings Entity
- Зберігає вартість генерації для кожного AI сервісу
- Поля: `ai_service`, `cost`, `is_active`, `type` (image/video)

---

## API Endpoints

### Отримання щоденної нагороди
- **Endpoint**: `POST /activity/claim-daily-reward`
- **Auth**: Required (JWT)
- **Response**: `{ success: boolean, message: string, pointsAwarded: number }`

### Отримання нагороди за шаринг
- **Endpoint**: `POST /post/share`
- **Auth**: Required (JWT)
- **Response**: `{ message: string, pointsAwarded: number }`

### Використання реферального коду
- **Endpoint**: `POST /user/use-referral-code`
- **Auth**: Required (JWT)
- **Body**: `{ referralCode: string }`

### Повернення понтів за генерацію
- **Endpoint**: `POST /image-generation/refund-credits`
- **Auth**: Required (JWT)
- **Body**: `{ posts: number[], ai_service: AIEnum }`
- **Response**: `{ success: boolean }`

### Отримання активностей
- **Endpoint**: `GET /activity/user-profile-activity?filter=earned|spent&period=day|week|month|year`
- **Auth**: Required (JWT)

---

## Статистика та аналітика

### Фільтрація активностей
- **Метод**: `getFilteredActivities()` в `activity.service.ts`
- **Типи "зароблено"**: `LIKE_EARN`, `DAILY_REWARD`, `SHARE_REWARD`, `CONTEST_WIN`
- **Типи "витрачено"**: `LIKE_SPEND`, `IMAGE_GENERATE_SPEND`, `CONTEST_CLOSE`
- **Періоди**: day, week, month, year

### Популярні пости
- **Endpoint**: `GET /activity/popular-posts`
- Повертає топ-6 постів за лайками та переглядами
- Періоди: today, yesterday, all_time, mixed

---

## Висновок

Система ревардів досить складна і включає:
- 7+ типів нагород
- Автоматичні cron jobs
- Ручні виклики через API
- Платіжну інтеграцію
- Систему відстеження через активності
- Refund механізм

### Критичні проблеми, які потребують негайного виправлення:
1. Конфлікт двох методів щоденної нагороди
2. Баг у реферальних нагородах (неправильне призначення активності)
3. Фіксована нагорода для автора топ-поста (несправедливість)

### Рекомендації для покращення:
1. Уніфікувати логіку щоденної нагороди
2. Виправити баг з реферальними нагородами
3. Додати обмеження для запобігання зловживанням
4. Додати активності для payment та refund операцій
5. Уніфікувати вартість генерації (використовувати таблицю для обох типів)
6. Додати транзакції для всіх операцій з понтами
7. Покращити документацію API
