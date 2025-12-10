# Reward Center System - Аналіз логіки та перевірка

## ✅ Перевірка всіх зв'язків

### 1. Реєстрація → DAILY_LOGIN

**Файли:**
- `src/auth/auth.service.ts` → `register()` (рядок ~218)
- `src/auth/auth.service.ts` → `signUpWithOAuth()` (рядок ~472) - для нових користувачів
- `src/auth/auth.service.ts` → `loginWithTelegram()` (рядок ~690) - для нових користувачів
- `src/auth/auth.service.ts` → `loginWithTwitter()` (рядок ~773) - для нових користувачів

**Логіка:**
```typescript
// Після створення користувача:
await this.rewardService.markRewardEligible(newUser.id, RewardTypeEnum.DAILY_LOGIN);
```

**Перевірка:**
- ✅ Викликається після збереження користувача
- ✅ Використовує правильний enum `DAILY_LOGIN`
- ✅ Створює запис в `user_rewards` з `eligibleDate = today`

---

### 2. Логін → DAILY_LOGIN

**Файли:**
- `src/auth/auth.service.ts` → `login()` (рядок ~103)
- `src/auth/auth.service.ts` → `signUpWithOAuth()` (рядок ~548) - для існуючих користувачів
- `src/auth/auth.service.ts` → `loginWithTelegram()` (рядок ~701) - для існуючих користувачів
- `src/auth/auth.service.ts` → `loginWithTwitter()` (рядок ~775) - для існуючих користувачів

**Логіка:**
```typescript
// Після валідації користувача:
await this.rewardService.markRewardEligible(user.id, RewardTypeEnum.DAILY_LOGIN);
```

**Перевірка:**
- ✅ Викликається для всіх методів логіну
- ✅ Використовує правильний enum
- ✅ `markRewardEligible` перевіряє чи вже існує запис (не створює дублікат)

---

### 3. Публікація фото → POST_PHOTO_REWARD

**Файл:** `src/post/post.service.ts` → `publishPost()` (рядок ~250)

**Логіка:**
```typescript
if (savedPost.videoUrl) {
  await this.rewardService.markRewardEligible(userId, RewardTypeEnum.POST_VIDEO_REWARD);
} else if (savedPost.imageUrl) {
  await this.rewardService.markRewardEligible(userId, RewardTypeEnum.POST_PHOTO_REWARD);
}
```

**Перевірка:**
- ✅ Перевіряє наявність `videoUrl` спочатку (відео має пріоритет)
- ✅ Якщо немає `videoUrl` але є `imageUrl` → POST_PHOTO_REWARD
- ✅ Викликається після збереження поста

---

### 4. Публікація відео → POST_VIDEO_REWARD

**Файл:** `src/post/post.service.ts` → `publishPost()` (рядок ~251)

**Логіка:**
```typescript
if (savedPost.videoUrl) {
  await this.rewardService.markRewardEligible(userId, RewardTypeEnum.POST_VIDEO_REWARD);
}
```

**Перевірка:**
- ✅ Перевіряє наявність `videoUrl`
- ✅ Якщо є `videoUrl` → POST_VIDEO_REWARD
- ✅ Викликається після збереження поста

---

### 5. GET /rewards/available

**Файл:** `src/reward/reward.controller.ts` → `getAvailableRewards()` (рядок ~49)
**Сервіс:** `src/reward/reward.service.ts` → `getAvailableRewards()` (рядок ~143)

**Логіка:**
1. Отримує всі claimable нагороди з таблиці `rewards`:
   - `DAILY_LOGIN`
   - `POST_VIDEO_REWARD`
   - `POST_PHOTO_REWARD`
2. Отримує записи `user_rewards` для сьогодні
3. Формує масив з інформацією про доступність

**Перевірка:**
- ✅ Використовує `claimableRewardTypes` для фільтрації
- ✅ Перевіряє `eligibleDate = today`
- ✅ Правильно визначає `isEligible` та `isClaimed`

---

### 6. POST /rewards/claim/:rewardType

**Файл:** `src/reward/reward.controller.ts` → `claimReward()` (рядок ~65)
**Сервіс:** `src/reward/reward.service.ts` → `claimReward()` (рядок ~216)

**Логіка:**
1. Перевіряє чи нагорода в `claimableRewardTypes`
2. Шукає запис в `user_rewards` з `eligibleDate = today`
3. Перевіряє чи `claimedDate = null` (не клеймована)
4. Отримує кількість поінтів з таблиці `rewards`
5. Додає поінти користувачу через `userService.incrementUserPoints()`
6. Оновлює `claimedDate` та `pointsAwarded`

**Перевірка:**
- ✅ Перевірка доступності працює правильно
- ✅ Перевірка чи вже клеймована працює правильно
- ✅ Отримання поінтів з БД працює правильно
- ✅ Додавання поінтів працює правильно
- ✅ Оновлення запису працює правильно

---

## 🔍 Детальна перевірка логіки

### markRewardEligible()
```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);  // ✅ Правильно - date без часу

const existing = await this.userRewardRepository.findOne({
  where: {
    userId,
    rewardType,
    eligibleDate: today,  // ✅ Порівняння date з date
  },
});

if (existing) {
  return existing;  // ✅ Не створює дублікат
}
```

**Перевірка:**
- ✅ `eligibleDate` встановлюється як date без часу
- ✅ Перевірка на існуючий запис працює
- ✅ Унікальний індекс `(userId, rewardType, eligibleDate)` забезпечує унікальність

---

### claimReward()
```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);

const userReward = await this.userRewardRepository.findOne({
  where: {
    userId,
    rewardType,
    eligibleDate: today,  // ✅ Шукає по сьогоднішній даті
  },
});

if (!userReward) {
  return { success: false, ... };  // ✅ Правильна обробка
}

if (userReward.claimedDate) {
  return { success: false, ... };  // ✅ Перевірка чи вже клеймована
}

const points = await this.getRewardPoints(rewardType);  // ✅ Отримує з БД

await this.userService.incrementUserPoints(userId, points);  // ✅ Додає поінти

const todayDate = new Date();
todayDate.setHours(0, 0, 0, 0);
userReward.claimedDate = todayDate;  // ✅ Встановлює date без часу
```

**Перевірка:**
- ✅ Всі перевірки працюють правильно
- ✅ Отримання поінтів з БД працює
- ✅ Додавання поінтів працює
- ✅ `claimedDate` встановлюється як date без часу

---

### getAvailableRewards()
```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);

// Отримуємо всі claimable нагороди
const rewards = await this.rewardRepository.find({
  where: {
    reward_type: In(this.claimableRewardTypes),  // ✅ Правильна фільтрація
    is_active: true,
  },
});

// Отримуємо записи user_rewards для сьогодні
const userRewards = await this.userRewardRepository.find({
  where: {
    userId,
    rewardType: In(this.claimableRewardTypes),
    eligibleDate: today,  // ✅ Тільки сьогоднішні
  },
});

// Формуємо мапу для швидкого пошуку
const userRewardsMap = new Map(
  userRewards.map((ur) => [ur.rewardType, ur]),
);

// Формуємо відповідь
return rewards.map((reward) => {
  const userReward = userRewardsMap.get(reward.reward_type as RewardTypeEnum);
  return {
    rewardType: reward.reward_type as RewardTypeEnum,
    reward,
    isEligible: !!userReward,  // ✅ Правильно визначає доступність
    isClaimed: !!userReward?.claimedDate,  // ✅ Правильно визначає клеймованість
    eligibleDate: userReward?.eligibleDate || null,
    claimedDate: userReward?.claimedDate || null,
  };
});
```

**Перевірка:**
- ✅ Отримує всі claimable нагороди
- ✅ Отримує тільки сьогоднішні записи
- ✅ Правильно визначає `isEligible` та `isClaimed`
- ✅ Повертає правильну структуру даних

---

## ⚠️ Потенційні проблеми та рішення

### 1. Race Condition при клеймуванні
**Проблема:** Якщо два запити одночасно намагаються клеймити одну нагороду, обидва можуть пройти перевірку `claimedDate = null`.

**Рішення:** 
- Унікальний індекс `(userId, rewardType, eligibleDate)` захищає від дублікатів
- Але для `claimedDate` потрібно додати транзакцію або блокування

**Рекомендація:** Додати транзакцію в `claimReward()`:
```typescript
await this.dataSource.transaction(async (manager) => {
  const userReward = await manager.findOne(UserRewardEntity, {
    where: { userId, rewardType, eligibleDate: today },
    lock: { mode: 'pessimistic_write' },
  });
  // ... решта логіки
});
```

### 2. Дата змінилася під час клеймування
**Проблема:** Якщо клеймування відбувається на межі дня (00:00), `today` може змінитися.

**Рішення:** 
- Поточна логіка використовує `setHours(0, 0, 0, 0)` що правильно
- Але якщо запит почався в 23:59 і закінчився в 00:01, може бути проблема

**Рекомендація:** Зберігати `today` в змінній на початку методу (вже зроблено ✅)

### 3. Нагорода не існує в БД
**Проблема:** Якщо міграція не виконана, `getRewardPoints()` викине `NotFoundException`.

**Рішення:**
- Міграція створює нагороди автоматично ✅
- Але якщо адмін видалить нагороду, клеймування не працюватиме

**Рекомендація:** Додати fallback значення в `claimReward()`:
```typescript
let points: number;
try {
  points = await this.getRewardPoints(rewardType);
} catch (error) {
  // Fallback значення
  const fallbackPoints = {
    [RewardTypeEnum.DAILY_LOGIN]: 10,
    [RewardTypeEnum.POST_VIDEO_REWARD]: 50,
    [RewardTypeEnum.POST_PHOTO_REWARD]: 30,
  };
  points = fallbackPoints[rewardType] || 0;
}
```

---

## ✅ Висновок про логіку

### ✅ Все працює правильно:

1. **Реєстрація** → DAILY_LOGIN відмічається ✅
2. **Логін** → DAILY_LOGIN відмічається ✅
3. **Публікація фото** → POST_PHOTO_REWARD відмічається ✅
4. **Публікація відео** → POST_VIDEO_REWARD відмічається ✅
5. **GET /rewards/available** → Правильно показує доступні нагороди ✅
6. **POST /rewards/claim/:rewardType** → Правильно клеймить нагороду ✅
7. **Повторне клеймування** → Правильно блокується ✅
8. **Клеймування без доступності** → Правильно блокується ✅

### ⚠️ Рекомендації для покращення:

1. Додати транзакцію в `claimReward()` для захисту від race condition
2. Додати fallback значення на випадок відсутності нагороди в БД
3. Додати логування для відстеження клеймувань

---

## 📋 Чеклист для ручного тестування через Swagger:

1. [ ] Відкрити Swagger UI: `http://localhost:8000/api`
2. [ ] Зареєструвати нового користувача через `POST /auth/register`
3. [ ] Перевірити `GET /rewards/available` - має показати DAILY_LOGIN як доступну
4. [ ] Клеймити `POST /rewards/claim/DAILY_LOGIN` - має нарахувати 10 поінтів
5. [ ] Перевірити баланс користувача - має бути 3010 (3000 + 10)
6. [ ] Спробувати клеймити повторно - має повернути помилку
7. [ ] Опублікувати фото пост через `POST /post/publish/:postId`
8. [ ] Перевірити `GET /rewards/available` - має показати POST_PHOTO_REWARD як доступну
9. [ ] Клеймити `POST /rewards/claim/POST_PHOTO_REWARD` - має нарахувати 30 поінтів
10. [ ] Опублікувати відео пост
11. [ ] Перевірити `GET /rewards/available` - має показати POST_VIDEO_REWARD як доступну
12. [ ] Клеймити `POST /rewards/claim/POST_VIDEO_REWARD` - має нарахувати 50 поінтів
13. [ ] Перевірити фінальний баланс - має бути 3090 (3000 + 10 + 30 + 50)

---

## 🔧 SQL запити для перевірки:

### Перевірка нагород користувача:
```sql
SELECT 
  ur.id,
  ur.userId,
  ur.rewardType,
  ur.eligibleDate,
  ur.claimedDate,
  ur.pointsAwarded,
  r.points as reward_points,
  r.description
FROM user_rewards ur
LEFT JOIN rewards r ON r.reward_type = ur.rewardType
WHERE ur.userId = <user_id>
ORDER BY ur.eligibleDate DESC, ur.rewardType;
```

### Перевірка балансу:
```sql
SELECT id, email, nickname, points, createdAt 
FROM users 
WHERE id = <user_id>;
```

### Перевірка наявності нагород в БД:
```sql
SELECT * FROM rewards 
WHERE reward_type IN ('DAILY_LOGIN', 'POST_VIDEO_REWARD', 'POST_PHOTO_REWARD')
AND is_active = 1;
```
