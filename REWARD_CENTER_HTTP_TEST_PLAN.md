# Reward Center System - HTTP Тестовий План

## Swagger UI
**URL:** `http://localhost:8000/api` (або ваш порт)

---

## Тестовий сценарій: Новий користувач з нуля

### Крок 1: Реєстрація нового користувача
**Ендпоінт:** `POST /auth/register`
**Swagger:** `/api#/Auth/AuthController_register`

**Request Body:**
```json
{
  "email": "testuser@example.com",
  "password": "Test1234!@#",
  "nickname": "testuser",
  "name": "Test User"
}
```

**Очікуваний результат:**
- ✅ Status: 201 Created
- ✅ Response містить:
  - `accessToken` - JWT токен
  - `refreshToken` - Refresh токен
  - `user` - інформація про користувача
  - `user.points` = 3000 (REGISTRATION_BONUS)
- ✅ В БД створено запис в `user_rewards`:
  - `userId` = новий ID
  - `rewardType` = 'DAILY_LOGIN'
  - `eligibleDate` = сьогоднішня дата
  - `claimedDate` = null
  - `pointsAwarded` = null

**Перевірка в БД:**
```sql
SELECT * FROM user_rewards WHERE userId = <новий_id> AND rewardType = 'DAILY_LOGIN';
-- Має бути 1 запис з eligibleDate = сьогодні, claimedDate = NULL
```

---

### Крок 2: Перевірка доступних нагород (після реєстрації)
**Ендпоінт:** `GET /rewards/available`
**Swagger:** `/api#/Rewards/RewardController_getAvailableRewards`
**Headers:** `Authorization: Bearer <accessToken>`

**Очікуваний результат:**
```json
[
  {
    "rewardType": "DAILY_LOGIN",
    "reward": {
      "id": 1,
      "reward_type": "DAILY_LOGIN",
      "points": 10,
      "description": "Daily login reward - claimable once per day",
      "is_active": true
    },
    "isEligible": true,        // ✅ Доступна!
    "isClaimed": false,
    "eligibleDate": "2025-12-10",
    "claimedDate": null
  },
  {
    "rewardType": "POST_VIDEO_REWARD",
    "reward": {
      "id": 2,
      "reward_type": "POST_VIDEO_REWARD",
      "points": 50,
      "description": "Reward for publishing a video post - claimable once per day",
      "is_active": true
    },
    "isEligible": false,        // ❌ Не доступна (ще не опубліковано відео)
    "isClaimed": false,
    "eligibleDate": null,
    "claimedDate": null
  },
  {
    "rewardType": "POST_PHOTO_REWARD",
    "reward": {
      "id": 3,
      "reward_type": "POST_PHOTO_REWARD",
      "points": 30,
      "description": "Reward for publishing a photo post - claimable once per day",
      "is_active": true
    },
    "isEligible": false,        // ❌ Не доступна (ще не опубліковано фото)
    "isClaimed": false,
    "eligibleDate": null,
    "claimedDate": null
  }
]
```

---

### Крок 3: Клеймування DAILY_LOGIN
**Ендпоінт:** `POST /rewards/claim/DAILY_LOGIN`
**Swagger:** `/api#/Rewards/RewardController_claimReward`
**Headers:** `Authorization: Bearer <accessToken>`

**Очікуваний результат:**
```json
{
  "success": true,
  "message": "Successfully claimed DAILY_LOGIN reward!",
  "pointsAwarded": 10
}
```

**Перевірка:**
- ✅ `user.points` збільшився з 3000 до 3010
- ✅ В БД `user_rewards.claimedDate` встановлено на сьогоднішню дату
- ✅ В БД `user_rewards.pointsAwarded` = 10

**SQL перевірка:**
```sql
SELECT * FROM user_rewards WHERE userId = <id> AND rewardType = 'DAILY_LOGIN';
-- claimedDate має бути сьогоднішня дата
-- pointsAwarded = 10

SELECT points FROM users WHERE id = <id>;
-- Має бути 3010 (3000 + 10)
```

---

### Крок 4: Повторна спроба клеймування DAILY_LOGIN
**Ендпоінт:** `POST /rewards/claim/DAILY_LOGIN`
**Headers:** `Authorization: Bearer <accessToken>`

**Очікуваний результат:**
```json
{
  "success": false,
  "message": "Reward DAILY_LOGIN has already been claimed today.",
  "pointsAwarded": 0
}
```

---

### Крок 5: Перевірка доступних нагород (після клеймування)
**Ендпоінт:** `GET /rewards/available`
**Headers:** `Authorization: Bearer <accessToken>`

**Очікуваний результат:**
```json
[
  {
    "rewardType": "DAILY_LOGIN",
    "isEligible": true,
    "isClaimed": true,        // ✅ Вже клеймована!
    "eligibleDate": "2025-12-10",
    "claimedDate": "2025-12-10"
  },
  ...
]
```

---

### Крок 6: Генерація зображення (для тестування публікації)
**Ендпоінт:** `POST /image-generation/generate`
**Swagger:** `/api#/Image Generation/ImageGenerationController_generateImage`
**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:**
```json
{
  "prompt": "beautiful landscape",
  "image_quantity": 1,
  "ai_service": "BYTEDANCE",
  "orientation": "horizontal"
}
```

**Очікуваний результат:**
- ✅ Створено пост з `imageUrl` (без `videoUrl`)
- ✅ Пост має `is_published = false`
- ✅ Пост збережено в БД

---

### Крок 7: Публікація фото поста
**Ендпоінт:** `POST /post/publish/:postId`
**Swagger:** `/api#/Post/PostController_publishPost`
**Headers:** `Authorization: Bearer <accessToken>`

**Очікуваний результат:**
- ✅ Пост опубліковано (`is_published = true`)
- ✅ В БД створено запис в `user_rewards`:
  - `rewardType` = 'POST_PHOTO_REWARD'
  - `eligibleDate` = сьогоднішня дата
  - `claimedDate` = null

**SQL перевірка:**
```sql
SELECT * FROM user_rewards WHERE userId = <id> AND rewardType = 'POST_PHOTO_REWARD';
-- Має бути 1 запис з eligibleDate = сьогодні, claimedDate = NULL
```

---

### Крок 8: Перевірка доступних нагород (після публікації фото)
**Ендпоінт:** `GET /rewards/available`
**Headers:** `Authorization: Bearer <accessToken>`

**Очікуваний результат:**
```json
[
  {
    "rewardType": "DAILY_LOGIN",
    "isEligible": true,
    "isClaimed": true
  },
  {
    "rewardType": "POST_PHOTO_REWARD",
    "isEligible": true,        // ✅ Тепер доступна!
    "isClaimed": false
  },
  {
    "rewardType": "POST_VIDEO_REWARD",
    "isEligible": false
  }
]
```

---

### Крок 9: Клеймування POST_PHOTO_REWARD
**Ендпоінт:** `POST /rewards/claim/POST_PHOTO_REWARD`
**Headers:** `Authorization: Bearer <accessToken>`

**Очікуваний результат:**
```json
{
  "success": true,
  "message": "Successfully claimed POST_PHOTO_REWARD reward!",
  "pointsAwarded": 30
}
```

**Перевірка:**
- ✅ `user.points` збільшився з 3010 до 3040
- ✅ В БД `user_rewards.claimedDate` встановлено для POST_PHOTO_REWARD

---

### Крок 10: Генерація відео (для тестування)
**Ендпоінт:** `POST /video-generation/generate`
**Swagger:** `/api#/Video Generation/VideoGenerationController_generateVideo`
**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:**
```json
{
  "prompt": "dancing person",
  "ai_service": "BYTY_DANCE",
  "image_url": "https://example.com/image.jpg"
}
```

**Очікуваний результат:**
- ✅ Створено пост з `videoUrl`
- ✅ Пост має `is_published = false`

---

### Крок 11: Публікація відео поста
**Ендпоінт:** `POST /post/publish/:postId`
**Headers:** `Authorization: Bearer <accessToken>`

**Очікуваний результат:**
- ✅ Пост опубліковано
- ✅ В БД створено запис в `user_rewards`:
  - `rewardType` = 'POST_VIDEO_REWARD'
  - `eligibleDate` = сьогоднішня дата

---

### Крок 12: Клеймування POST_VIDEO_REWARD
**Ендпоінт:** `POST /rewards/claim/POST_VIDEO_REWARD`
**Headers:** `Authorization: Bearer <accessToken>`

**Очікуваний результат:**
```json
{
  "success": true,
  "message": "Successfully claimed POST_VIDEO_REWARD reward!",
  "pointsAwarded": 50
}
```

**Перевірка:**
- ✅ `user.points` збільшився з 3040 до 3090

---

### Крок 13: Фінальна перевірка доступних нагород
**Ендпоінт:** `GET /rewards/available`
**Headers:** `Authorization: Bearer <accessToken>`

**Очікуваний результат:**
```json
[
  {
    "rewardType": "DAILY_LOGIN",
    "isEligible": true,
    "isClaimed": true
  },
  {
    "rewardType": "POST_PHOTO_REWARD",
    "isEligible": true,
    "isClaimed": true
  },
  {
    "rewardType": "POST_VIDEO_REWARD",
    "isEligible": true,
    "isClaimed": true
  }
]
```

---

## Перевірка логіки через SQL

### Перевірка всіх нагород користувача:
```sql
SELECT 
  ur.*,
  r.points as reward_points,
  r.description
FROM user_rewards ur
JOIN rewards r ON r.reward_type = ur.rewardType
WHERE ur.userId = <user_id>
ORDER BY ur.eligibleDate DESC, ur.rewardType;
```

### Перевірка балансу користувача:
```sql
SELECT id, email, nickname, points FROM users WHERE id = <user_id>;
```

### Перевірка активностей (опціонально):
```sql
SELECT * FROM activities 
WHERE toUserId = <user_id> 
AND activityType IN ('DAILY_REWARD', 'DAILY_LOGIN')
ORDER BY createdAt DESC;
```

---

## Потенційні проблеми для перевірки:

1. **Race condition**: Якщо два запити одночасно намагаються клеймити одну нагороду
2. **Дата змінилася**: Якщо клеймування відбувається на межі дня (00:00)
3. **Нагорода не існує в БД**: Якщо міграція не виконана
4. **Повторна відмітка**: Якщо `markRewardEligible` викликається двічі - має повернути існуючий запис

---

## Чеклист для тестування:

- [ ] Реєстрація створює запис user_rewards для DAILY_LOGIN
- [ ] GET /rewards/available показує DAILY_LOGIN як доступну після реєстрації
- [ ] POST /rewards/claim/DAILY_LOGIN нараховує поінти
- [ ] Повторне клеймування DAILY_LOGIN блокується
- [ ] Публікація фото створює запис для POST_PHOTO_REWARD
- [ ] Публікація відео створює запис для POST_VIDEO_REWARD
- [ ] Клеймування POST_PHOTO_REWARD працює
- [ ] Клеймування POST_VIDEO_REWARD працює
- [ ] GET /rewards/available показує правильні статуси
- [ ] Поінти правильно додаються до балансу користувача
