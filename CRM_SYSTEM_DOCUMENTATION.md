# Документація системи CRM (Партнерство)

## Загальний опис

Система CRM (Customer Relationship Management) в Yallery - це комплексна система управління партнерськими програмами та реферальними посиланнями. Вона дозволяє створювати партнерства, генерувати унікальні реферальні посилання, відстежувати активності користувачів та експортувати аналітичні дані.

---

## 1. Архітектура та основні компоненти

### 1.1 База даних - Сутності (Entities)

#### `PartnershipEntity` (таблиця `partnerships`)
Основна сутність партнерства, що зберігає інформацію про партнера.

**Поля:**
- `id` (number) - унікальний ідентифікатор партнерства
- `partnerName` (string) - ім'я партнера
- `companyName` (string) - назва компанії
- `source` (enum) - джерело партнерства:
  - `MINI_APP` - Telegram Mini App
  - `REGULAR_APP` - Мобільний додаток (iOS/Android)
  - `WEB_APP` - Веб-додаток
- `referralToken` (string) - унікальний UUID токен для реферального посилання
- `referralLink` (string) - згенероване реферальне посилання
- `createdAt` (Date) - дата створення партнерства

**Файл:** `src/admin/entities/partner.entity.ts`

#### `PartnerUserLinkEntity` (таблиця `partner_user_links`)
Зв'язок між партнерством та користувачем системи.

**Поля:**
- `id` (number) - унікальний ідентифікатор зв'язку
- `partnershipId` (number) - ID партнерства (FK до `partnerships`)
- `partnerUserId` (string) - ID користувача у системі партнера (зовнішній ID)
- `userId` (number, nullable) - ID користувача в Yallery (FK до `users`)
- `createdAt` (Date) - дата створення зв'язку

**Особливості:**
- Унікальний індекс на комбінації `(partnershipId, partnerUserId)` - один партнерський користувач може бути пов'язаний тільки з одним партнерством
- `userId` може бути `null` до моменту реєстрації користувача в системі

**Файл:** `src/admin/entities/partner-user-link.entity.ts`

#### `PartnershipActivityEntity` (таблиця `partnership_activities`)
Журнал активностей користувачів, пов'язаних з партнерством.

**Поля:**
- `id` (number) - унікальний ідентифікатор активності
- `partnershipId` (number) - ID партнерства (FK до `partnerships`)
- `userId` (number) - ID користувача в Yallery (FK до `users`)
- `activity` (string) - тип активності:
  - `registered` - користувач зареєструвався через реферальне посилання
  - `image_generated` - користувач згенерував зображення
  - `posted_to_twitter` - користувач опублікував пост у Twitter
  - `retweet` - користувач зробив ретвіт поста @y_allery
- `createdAt` (Date) - дата виконання активності

**Файл:** `src/admin/entities/partnership-activity.entity.ts`

---

## 2. Створення партнерства та генерація реферальних посилань

### 2.1 Створення партнерства

**Endpoint:** `POST /admin/create-partnership`

**Авторизація:** Потрібна роль `ADMIN`

**DTO:** `CreatePartnershipDto`
```typescript
{
  partnerName: string;      // Ім'я партнера
  companyName: string;      // Назва компанії
  source: PartnershipSource; // 'mini app' | 'regular app' | 'web app'
  contestId?: number;        // Опціонально: ID контесту для веб-посилання
}
```

**Процес створення:**

1. **Генерація унікального токену:**
   - Генерується UUID v4 токен через `uuidv4()`
   - Токен зберігається в полі `referralToken`

2. **Генерація реферального посилання залежно від джерела:**

   **a) MINI_APP (Telegram Mini App):**
   ```
   https://t.me/yallery_bot?start={referralToken}
   ```

   **b) WEB_APP:**
   - Якщо вказано `contestId`:
     ```
     {WEB_APP_URL}/contests/{contestId}?ref={referralToken}
     ```
   - Якщо `contestId` не вказано:
     ```
     {WEB_APP_URL}/?ref={referralToken}
     ```

   **c) REGULAR_APP (iOS/Android через Branch.io):**
   - Створюється deep link через Branch.io API
   - Payload містить:
     ```json
     {
       "branch_key": "{BRANCH_KEY}",
       "data": {
         "$canonical_identifier": "referral/{referralToken}",
         "$desktop_url": "https://cuyab.app.link/rhHoT4tRzTb",
         "$ios_url": "https://apps.apple.com/us/app/yallery/id6456609257",
         "$android_url": "https://play.google.com/store/apps/details?id=app.yallery.y_allery_mobile_client&pli=1",
         "referral_token": "{referralToken}",
         "$og_title": "Join me on Y'allery. Let's generate pictures together!",
         "contest_id": {contestId} | null
       }
     }
     ```
   - Відправляється POST запит на `https://api2.branch.io/v1/url`
   - Отриманий URL зберігається як `referralLink`

3. **Збереження партнерства:**
   - Створюється запис в таблиці `partnerships`
   - Повертається об'єкт партнерства з усіма даними

**Файл:** `src/admin/admin.service.ts` - метод `createPartnership()`

---

## 3. Реєстрація користувача через реферальне посилання

### 3.1 Процес реєстрації з реферальними даними

**Endpoint:** `POST /auth/register`

**DTO:** `SignUpDto` (містить опціональні поля `ref` та `puid`)

**Процес:**

1. **Перевірка наявності реферальних даних:**
   - Якщо передано `dto.ref` (referralToken) та `dto.puid` (partnerUserId)

2. **Пошук партнерства:**
   ```typescript
   const partnership = await partnershipRepo.findOne({
     where: { referralToken: dto.ref }
   });
   ```

3. **Створення зв'язку користувача з партнерством:**
   - Перевірка чи не існує вже зв'язок з такими `partnershipId` та `partnerUserId`
   - Якщо не існує, створюється запис в `partner_user_links`:
     ```typescript
     {
       partnershipId: partnership.id,
       partnerUserId: dto.puid,
       userId: newUser.id  // ID щойно створеного користувача
     }
     ```

4. **Автоматичне логування активності `registered`:**
   - Створюється запис в `partnership_activities`:
     ```typescript
     {
       partnershipId: partnership.id,
       userId: newUser.id,
       activity: 'registered'
     }
     ```

**Файл:** `src/auth/auth.service.ts` - метод `register()`

### 3.2 Авторизація через соціальні мережі з реферальними даними

Аналогічний процес відбувається при авторизації через:
- Google OAuth (`POST /auth/google`)
- Apple Sign In (`POST /auth/apple`)
- Twitter OAuth (`POST /auth/twitter`)

Реферальні дані передаються через параметри `extras.ref` та `extras.puid`.

---

## 4. Відстеження активностей користувачів

### 4.1 Доступні типи активностей

- **`registered`** - автоматично логується при реєстрації через реферальне посилання
- **`image_generated`** - логується при генерації зображення (через внутрішній API)
- **`posted_to_twitter`** - встановлюється через API партнера
- **`retweet`** - перевіряється через Twitter API в реальному часі

### 4.2 Встановлення прапорця активності

**Endpoint:** `POST /partner/referral-flag` (публічний, без авторизації)

**Параметри:**
```typescript
{
  ref: string;    // referralToken
  puid: string;   // partnerUserId
  flag: string;   // Тип активності
}
```

**Процес:**

1. **Пошук партнерства:**
   ```typescript
   const partnership = await partnershipRepo.findOne({
     where: { referralToken: ref }
   });
   ```

2. **Пошук зв'язку користувача:**
   ```typescript
   const link = await partnerUserLinkRepo.findOne({
     where: {
       partnershipId: partnership.id,
       partnerUserId: puid
     }
   });
   ```

3. **Перевірка наявності активності:**
   - Якщо активність вже існує - повертається `{ status: true }`
   - Якщо не існує - створюється новий запис в `partnership_activities`

4. **Збереження:**
   ```typescript
   {
     partnershipId: partnership.id,
     userId: link.userId,
     activity: flag
   }
   ```

**Файл:** `src/admin/admin.service.ts` - метод `setReferralFlag()`

### 4.3 Перевірка статусу прапорця активності

**Endpoint:** `GET /partner/referral-status` (публічний)

**Query параметри:**
- `ref` (string) - referralToken
- `puid` (string) - partnerUserId
- `flag` (string) - тип активності для перевірки

**Особливості перевірки `retweet`:**

Для прапорця `retweet` виконується спеціальна логіка:

1. **Перевірка кешу в БД:**
   - Спочатку перевіряється чи є запис в `partnership_activities` з `activity = 'retweet'`
   - Якщо є - повертається `{ status: "true" }`

2. **Реал-тайм перевірка через TweetScout API:**
   - Якщо запису немає, виконується перевірка через API
   - Отримується `twitterUsername` користувача з таблиці `users`
   - Відправляється POST запит на `https://api.tweetscout.io/v2/user-tweets`:
     ```typescript
     {
       link: `https://twitter.com/${twitterUsername}`,
       cursor?: string  // Для пагінації
     }
     ```

3. **Аналіз твітів:**
   - Перевіряється до 15 останніх твітів користувача
   - Шукається згадка `@y_allery` в тексті твіта
   - Якщо знайдено - зберігається в БД та повертається `{ status: "true" }`

4. **Збереження результату:**
   - При успішній перевірці створюється запис в `partnership_activities` для майбутніх перевірок

**Файл:** `src/admin/admin.service.ts` - метод `checkReferralFlag()` та `checkRetweet()`

---

## 5. Експорт даних для CRM

### 5.1 Експорт Twitter даних

**Endpoint:** `GET /admin/export-twitter-data` (тільки для адмінів)

**Процес:**

1. **Збір даних з різних джерел:**

   **a) Top Following (топ підписок):**
   - Запит до `{TWEETSCOUT_API_URL}/top-following/{accountName}?from=db`
   - Повертає список користувачів, на яких підписаний акаунт @y_allery

   **b) Top Followers (топ підписників):**
   - Запит до `{TWITTER_SCORE_API_URL}/get_twitter_top_followers`
   - Параметри: `api_key`, `twitter_id`, `period=30`
   - Повертає топ підписників за останні 30 днів

   **c) Followers History (історія підписників):**
   - Запит до `{TWITTER_SCORE_API_URL}/followers_count_history`
   - Параметри: `api_key`, `twitter_id`, `period=30`
   - Повертає історію зміни кількості підписників

   **d) New Followers (нові підписники):**
   - Запит до `{TWITTER_SCORE_API_URL}/get_twitter_top_followers`
   - Параметри: `api_key`, `twitter_id`, `period=30`
   - Повертає нових підписників за останні 30 днів

   **e) Twitter Score:**
   - Запит до `{TWEETSCOUT_API_URL}/score/{accountName}`
   - Повертає загальний скор акаунту

2. **Форматування в CSV:**

   **Формат для Top Following/Top Followers/New Followers:**
   ```csv
   ID,Name,Screen Name,Score,Followers Count,Friends Count,Verified,Description
   ```

   **Формат для Followers History:**
   ```csv
   Date,Followers Count
   ```

3. **Створення ZIP архіву:**
   - Використовується бібліотека `adm-zip`
   - Створюється архів з файлами:
     - `top-following.csv`
     - `top-followers.csv`
     - `followers-history.csv`
     - `new-followers-30d.csv`
     - `score.txt` (текстовий файл зі скором)

4. **Повернення:**
   - Повертається буфер ZIP файлу для завантаження

**Файл:** `src/admin/admin.service.ts` - метод `exportTwitterDataWithFollowers()`

---

## 6. Отримання статистики партнерств

### 6.1 Список всіх партнерств зі статистикою

**Endpoint:** `GET /admin/partnerships`

**Авторизація:** Потрібна роль `ADMIN`

**Процес:**

1. **Отримання всіх партнерств:**
   ```typescript
   const partnerships = await partnershipRepo.find({
     order: { createdAt: 'DESC' }
   });
   ```

2. **Розрахунок статистики активностей для кожного партнерства:**
   ```typescript
   const activities = await partnershipActivityRepo
     .createQueryBuilder('activity')
     .select('activity.activity', 'activity')
     .addSelect('COUNT(*)', 'count')
     .where('activity.partnershipId = :id', { id: partner.id })
     .groupBy('activity.activity')
     .getRawMany();
   ```

3. **Форматування результату:**
   ```typescript
   {
     ...partnership,
     activityStats: {
       registered: 10,
       image_generated: 5,
       posted_to_twitter: 3,
       retweet: 2
     }
   }
   ```

**Файл:** `src/admin/admin.service.ts` - метод `getAllPartnershipsWithStats()`

### 6.2 Партнерства зі зв'язками користувачів

**Endpoint:** `GET /admin/partnerships/with-links`

**Авторизація:** Потрібна роль `ADMIN`

**Процес:**

1. Отримуються всі партнерства
2. Для кожного партнерства знаходяться всі зв'язки з користувачами
3. Для кожного зв'язку завантажується інформація про користувача (email, twitterUsername)
4. Повертається структурований список з повною інформацією

**Файл:** `src/admin/admin.service.ts` - метод `getPartnershipsWithUserLinks()`

---

## 7. Управління партнерствами

### 7.1 Видалення партнерства

**Endpoint:** `DELETE /admin/partnership/:id`

**Авторизація:** Потрібна роль `ADMIN`

**Процес (каскадне видалення):**

1. Видаляються всі записи з `partnership_activities` для даного партнерства
2. Видаляються всі записи з `partner_user_links` для даного партнерства
3. Видаляється саме партнерство з `partnerships`

**Файл:** `src/admin/admin.service.ts` - метод `deletePartnership()`

---

## 8. Конфігурація та змінні середовища

### 8.1 Необхідні змінні середовища

```env
# Twitter API (TweetScout)
TWEETSCOUT_API_KEY=your_api_key
TWEETSCOUT_API_URL=https://api.tweetscout.io/v2

# Twitter Score API
TWITTER_SCORE_API_KEY=your_api_key
TWITTER_SCORE_API_URL=https://twitterscore.io/api/v1
TWITTER_ACCOUNT_NAME=y_allery
TWITTER_ACCOUNT_ID=your_twitter_id

# Branch.io (для deep links)
BRANCH_KEY=your_branch_key

# Web App URL (для веб-реферальних посилань)
WEB_APP_URL=https://yallery.web.app
```

---

## 9. API Endpoints - Повний список

### 9.1 Адмінські endpoints (потрібна роль ADMIN)

| Метод | Endpoint | Опис |
|-------|----------|------|
| POST | `/admin/create-partnership` | Створити нове партнерство |
| GET | `/admin/partnerships` | Отримати всі партнерства зі статистикою |
| GET | `/admin/partnerships/with-links` | Отримати партнерства зі зв'язками користувачів |
| DELETE | `/admin/partnership/:id` | Видалити партнерство |
| GET | `/admin/referral-status` | Перевірити статус прапорця (адмін версія) |
| POST | `/admin/referral-flag` | Встановити прапорець активності (адмін версія) |
| GET | `/admin/export-twitter-data` | Експортувати Twitter дані в ZIP |

### 9.2 Публічні endpoints (для партнерів)

| Метод | Endpoint | Опис |
|-------|----------|------|
| GET | `/partner/referral-status` | Перевірити статус прапорця активності |
| POST | `/partner/referral-flag` | Встановити прапорець активності |

---

## 10. Приклади використання

### 10.1 Створення партнерства для Telegram Mini App

```bash
curl -X POST 'https://api.yallery.com/admin/create-partnership' \
  -H 'Authorization: Bearer {admin_token}' \
  -H 'Content-Type: application/json' \
  -d '{
    "partnerName": "John Doe",
    "companyName": "Example Corp",
    "source": "mini app"
  }'
```

**Відповідь:**
```json
{
  "id": 1,
  "partnerName": "John Doe",
  "companyName": "Example Corp",
  "source": "mini app",
  "referralToken": "7d4b2eec-1234-5678-9abc-def012345678",
  "referralLink": "https://t.me/yallery_bot?start=7d4b2eec-1234-5678-9abc-def012345678",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### 10.2 Перевірка статусу активності користувача

```bash
curl -X GET 'https://api.yallery.com/partner/referral-status?ref=7d4b2eec-1234-5678-9abc-def012345678&puid=partner-user-123&flag=registered'
```

**Відповідь:**
```json
{
  "status": "true"
}
```

### 10.3 Встановлення прапорця активності

```bash
curl -X POST 'https://api.yallery.com/partner/referral-flag' \
  -H 'Content-Type: application/json' \
  -d '{
    "ref": "7d4b2eec-1234-5678-9abc-def012345678",
    "puid": "partner-user-123",
    "flag": "posted_to_twitter"
  }'
```

**Відповідь:**
```json
{
  "status": true
}
```

---

## 11. Технічні деталі та залежності

### 11.1 Бібліотеки

- **`uuid`** (v4) - генерація унікальних токенів
- **`adm-zip`** - створення ZIP архівів для експорту
- **`csv-writer`** - форматування CSV файлів
- **`axios`** - HTTP запити до зовнішніх API
- **`@nestjs/typeorm`** - робота з базою даних

### 11.2 Зовнішні API

1. **TweetScout API** (`api.tweetscout.io`)
   - Отримання твітів користувачів
   - Отримання топ підписок
   - Отримання скору акаунту

2. **Twitter Score API** (`twitterscore.io`)
   - Отримання топ підписників
   - Історія зміни кількості підписників

3. **Branch.io API** (`api2.branch.io`)
   - Генерація deep links для мобільних додатків

---

## 12. Безпека та обмеження

### 12.1 Авторизація

- Адмінські endpoints вимагають JWT токен з роллю `ADMIN`
- Публічні endpoints (`/partner/*`) доступні без авторизації
- Перевірка валідності `referralToken` виконується для всіх операцій

### 12.2 Валідація даних

- `referralToken` повинен існувати в базі даних
- `partnerUserId` повинен бути унікальним в межах одного партнерства
- Типи активностей (`flag`) не валідуються строго - можна передавати будь-який рядок

### 12.3 Обмеження

- Перевірка `retweet` обмежена 15 останніми твітами
- Експорт Twitter даних може бути повільним при великій кількості даних
- Каскадне видалення партнерства видаляє всі пов'язані дані без можливості відновлення

---

## 13. Моніторинг та логування

### 13.1 Логування

Система використовує NestJS Logger для логування:
- Створення партнерств
- Помилки при перевірці retweet
- Помилки при збереженні активностей

### 13.2 Обробка помилок

- Якщо партнерство не знайдено - повертається `{ status: false }`
- Якщо зв'язок користувача не знайдено - повертається `{ status: false }`
- Помилки API логуються з повним стеком помилок

---

## 14. Майбутні покращення

### Можливі розширення:

1. **Вебхуки** - відправка подій партнерам при зміні статусів
2. **Аналітика** - детальна статистика по партнерствам з графіками
3. **Автоматичні нарахування** - система винагород для партнерів
4. **Експорт в різні формати** - Excel, JSON, XML
5. **Batch операції** - масове встановлення прапорців
6. **Валідація типів активностей** - enum для типів активностей
7. **Rate limiting** - обмеження кількості запитів від партнерів

---

## 15. Структура файлів

```
src/admin/
├── admin.controller.ts          # Адмінські endpoints
├── admin.service.ts             # Основна логіка CRM системи
├── partner.controller.ts        # Публічні endpoints для партнерів
├── admin.module.ts              # Модуль адміністратора
├── dto/
│   └── create.refferal.dto.ts   # DTO для створення партнерства
└── entities/
    ├── partner.entity.ts                    # PartnershipEntity
    ├── partner-user-link.entity.ts          # PartnerUserLinkEntity
    └── partnership-activity.entity.ts       # PartnershipActivityEntity
```

---

## Висновок

Система CRM Yallery забезпечує повний цикл управління партнерськими програмами: від створення партнерств та генерації реферальних посилань до відстеження активностей користувачів та експорту аналітичних даних. Система інтегрована з Twitter API для реал-тайм перевірки активностей та підтримує різні типи джерел трафіку (Telegram, мобільні додатки, веб).

