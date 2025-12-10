# Тестування Reward Center System - Повне флоу

## Сценарій 1: Новий користувач - Реєстрація через email/password

### Крок 1: Реєстрація
**Ендпоінт:** `POST /auth/register`
- ✅ Користувач створюється
- ✅ Отримує `REGISTRATION_BONUS` (3000 поінтів)
- ✅ Отримує `accessToken` та `refreshToken`
- ✅ **DAILY_LOGIN відмічається як доступна** (новий фікс)

### Крок 2: Перевірка доступних нагород
**Ендпоінт:** `GET /rewards/available`
**Очікуваний результат:**
```json
[
  {
    "rewardType": "DAILY_LOGIN",
    "reward": { "points": 10, ... },
    "isEligible": true,
    "isClaimed": false,
    "eligibleDate": "2025-12-10",
    "claimedDate": null
  },
  {
    "rewardType": "POST_VIDEO_REWARD",
    "reward": { "points": 50, ... },
    "isEligible": false,
    "isClaimed": false,
    "eligibleDate": null,
    "claimedDate": null
  },
  {
    "rewardType": "POST_PHOTO_REWARD",
    "reward": { "points": 30, ... },
    "isEligible": false,
    "isClaimed": false,
    "eligibleDate": null,
    "claimedDate": null
  }
]
```

### Крок 3: Клеймування DAILY_LOGIN
**Ендпоінт:** `POST /rewards/claim/DAILY_LOGIN`
**Очікуваний результат:**
```json
{
  "success": true,
  "message": "Successfully claimed DAILY_LOGIN reward!",
  "pointsAwarded": 10
}
```
- ✅ Користувач отримує 10 поінтів
- ✅ `user.points` збільшується на 10
- ✅ `user_rewards.claimedDate` встановлюється
- ✅ `user_rewards.pointsAwarded` = 10

### Крок 4: Повторна спроба клеймування
**Ендпоінт:** `POST /rewards/claim/DAILY_LOGIN`
**Очікуваний результат:**
```json
{
  "success": false,
  "message": "Reward DAILY_LOGIN has already been claimed today.",
  "pointsAwarded": 0
}
```

### Крок 5: Публікація фото поста
**Ендпоінт:** `POST /post/publish/:postId` (пост з `imageUrl`, без `videoUrl`)
- ✅ Пост публікується
- ✅ **POST_PHOTO_REWARD відмічається як доступна**

### Крок 6: Перевірка доступних нагород після публікації
**Ендпоінт:** `GET /rewards/available`
**Очікуваний результат:**
```json
[
  {
    "rewardType": "DAILY_LOGIN",
    "isEligible": true,
    "isClaimed": true,  // Вже клеймована
    ...
  },
  {
    "rewardType": "POST_PHOTO_REWARD",
    "isEligible": true,  // Тепер доступна!
    "isClaimed": false,
    "eligibleDate": "2025-12-10",
    ...
  }
]
```

### Крок 7: Клеймування POST_PHOTO_REWARD
**Ендпоінт:** `POST /rewards/claim/POST_PHOTO_REWARD`
**Очікуваний результат:**
```json
{
  "success": true,
  "message": "Successfully claimed POST_PHOTO_REWARD reward!",
  "pointsAwarded": 30
}
```

### Крок 8: Публікація відео поста
**Ендпоінт:** `POST /post/publish/:postId` (пост з `videoUrl`)
- ✅ Пост публікується
- ✅ **POST_VIDEO_REWARD відмічається як доступна**

### Крок 9: Клеймування POST_VIDEO_REWARD
**Ендпоінт:** `POST /rewards/claim/POST_VIDEO_REWARD`
**Очікуваний результат:**
```json
{
  "success": true,
  "message": "Successfully claimed POST_VIDEO_REWARD reward!",
  "pointsAwarded": 50
}
```

---

## Сценарій 2: Існуючий користувач - Логін

### Крок 1: Логін
**Ендпоінт:** `POST /auth/login`
- ✅ Користувач авторизується
- ✅ Отримує `accessToken` та `refreshToken`
- ✅ **DAILY_LOGIN відмічається як доступна**

### Крок 2: Перевірка доступних нагород
**Ендпоінт:** `GET /rewards/available`
- ✅ DAILY_LOGIN доступна (якщо ще не клеймована сьогодні)

### Крок 3: Клеймування
- ✅ Може клеймити DAILY_LOGIN
- ✅ Отримує поінти

---

## Сценарій 3: OAuth реєстрація/логін

### Google/Apple OAuth
**Ендпоінт:** `POST /auth/signup-with-oauth`
- ✅ Новий користувач: отримує REGISTRATION_BONUS + DAILY_LOGIN доступна
- ✅ Існуючий користувач: DAILY_LOGIN відмічається як доступна

### Telegram логін
**Ендпоінт:** `POST /auth/login-with-telegram`
- ✅ Новий користувач: отримує REGISTRATION_BONUS + DAILY_LOGIN доступна
- ✅ Існуючий користувач: DAILY_LOGIN відмічається як доступна

### Twitter логін
**Ендпоінт:** `POST /auth/login-with-twitter`
- ✅ Новий користувач: отримує REGISTRATION_BONUS + DAILY_LOGIN доступна
- ✅ Існуючий користувач: DAILY_LOGIN відмічається як доступна

---

## Перевірка логіки

### ✅ Перевірено:
1. **Реєстрація** → DAILY_LOGIN доступна
2. **Логін** → DAILY_LOGIN доступна
3. **Публікація фото** → POST_PHOTO_REWARD доступна
4. **Публікація відео** → POST_VIDEO_REWARD доступна
5. **Клеймування** → Поінти додаються, нагорода позначається як клеймована
6. **Повторне клеймування** → Блокується
7. **Клеймування без доступності** → Блокується

### ⚠️ Потенційні проблеми:
1. **Конкурентність**: Якщо два запити одночасно намагаються клеймити одну нагороду - можливий race condition. Потрібно додати транзакцію або блокування.

### 🔍 Рекомендації для тестування:
1. Створити нового користувача
2. Перевірити GET /rewards/available
3. Клеймити DAILY_LOGIN
4. Опублікувати фото
5. Перевірити GET /rewards/available (має бути POST_PHOTO_REWARD)
6. Клеймити POST_PHOTO_REWARD
7. Опублікувати відео
8. Перевірити GET /rewards/available (має бути POST_VIDEO_REWARD)
9. Клеймити POST_VIDEO_REWARD
10. Спробувати клеймити повторно (має бути помилка)
