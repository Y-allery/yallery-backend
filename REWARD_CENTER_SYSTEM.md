# Reward Center System - Документація

## Огляд

Система Reward Center дозволяє користувачам клеймити нагороди за виконання певних дій. Кожен користувач може мати кілька доступних нагород одночасно, які можна клеймити в Reward Center.

---

## Типи нагород, які можна клеймити

### 1. DAILY_LOGIN (Щоденний логін)
- **Коли стає доступною**: При логіні користувача (будь-яким способом)
- **Коли можна клеймити**: Після логіну, один раз на день
- **Значення за замовчуванням**: 10 поінтів
- **Логіка**: Автоматично відмічається як доступна при:
  - `POST /auth/login`
  - `POST /auth/login-with-telegram`
  - `POST /auth/login-with-twitter`
  - `POST /auth/signup-with-oauth` (для існуючих користувачів)

### 2. POST_VIDEO_REWARD (Нагорода за публікацію відео)
- **Коли стає доступною**: При публікації поста з відео (`videoUrl` не null)
- **Коли можна клеймити**: Після публікації відео, один раз на день
- **Значення за замовчуванням**: 50 поінтів
- **Логіка**: Автоматично відмічається як доступна при:
  - `POST /post/publish/:postId` (якщо пост має `videoUrl`)

### 3. POST_PHOTO_REWARD (Нагорода за публікацію фото)
- **Коли стає доступною**: При публікації поста з фото (`imageUrl` не null, `videoUrl` null)
- **Коли можна клеймити**: Після публікації фото, один раз на день
- **Значення за замовчуванням**: 30 поінтів
- **Логіка**: Автоматично відмічається як доступна при:
  - `POST /post/publish/:postId` (якщо пост має `imageUrl` і немає `videoUrl`)

---

## Структура бази даних

### Таблиця `user_rewards`

Відстежує доступність та клеймування нагород для кожного користувача.

```sql
CREATE TABLE `user_rewards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `rewardType` varchar(255) NOT NULL,
  `eligibleDate` date NOT NULL,        -- Дата коли нагорода стала доступною
  `claimedDate` date NULL,             -- Дата коли нагорода була клеймована (NULL якщо не клеймована)
  `pointsAwarded` int NULL,            -- Кількість поінтів які були нараховані
  `createdAt` timestamp(6) NOT NULL,
  `updatedAt` timestamp(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_user_reward_eligible` (`userId`, `rewardType`, `eligibleDate`),
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
```

**Унікальний індекс**: `(userId, rewardType, eligibleDate)` - забезпечує що одна нагорода може бути доступна один раз на день.

---

## API Ендпоінти

### GET /rewards/available
Отримати всі доступні нагороди для поточного користувача.

**Response:**
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
    "isEligible": true,
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
    "isEligible": true,
    "isClaimed": true,
    "eligibleDate": "2025-12-10",
    "claimedDate": "2025-12-10"
  }
]
```

### POST /rewards/claim/:rewardType
Клеймити нагороду.

**Parameters:**
- `rewardType`: Тип нагороди (DAILY_LOGIN, POST_VIDEO_REWARD, POST_PHOTO_REWARD)

**Response (Success):**
```json
{
  "success": true,
  "message": "Successfully claimed DAILY_LOGIN reward!",
  "pointsAwarded": 10
}
```

**Response (Error - не доступна):**
```json
{
  "success": false,
  "message": "Reward DAILY_LOGIN is not available. Complete the required action first.",
  "pointsAwarded": 0
}
```

**Response (Error - вже клеймована):**
```json
{
  "success": false,
  "message": "Reward DAILY_LOGIN has already been claimed today.",
  "pointsAwarded": 0
}
```

---

## Логіка роботи

### 1. Відмітка доступності нагороди

Коли користувач виконує дію (логін, публікація), система автоматично викликає:
```typescript
await rewardService.markRewardEligible(userId, rewardType);
```

Це створює запис в `user_rewards` з:
- `eligibleDate = today`
- `claimedDate = null`
- `pointsAwarded = null`

### 2. Перевірка доступності

Перед клеймуванням система перевіряє:
1. Чи існує запис з `eligibleDate = today`
2. Чи `claimedDate = null` (не клеймована)

### 3. Клеймування нагороди

При клеймуванні:
1. Перевіряється доступність
2. Отримується кількість поінтів з таблиці `rewards`
3. Додаються поінти користувачу (`user.points += points`)
4. Оновлюється запис:
   - `claimedDate = today`
   - `pointsAwarded = points`

---

## Міграції

### 1. `1765328000000-create-user-rewards-table.ts`
Створює таблицю `user_rewards` для відстеження нагород.

### 2. `1765328001000-update-rewards-add-new-types.ts`
Додає нові типи нагород в таблицю `rewards`:
- `DAILY_LOGIN` (10 поінтів)
- `POST_VIDEO_REWARD` (50 поінтів)
- `POST_PHOTO_REWARD` (30 поінтів)

---

## Зворотна сумісність

- `DAILY_REWARD` залишається в enum для зворотної сумісності
- Стара логіка `claimDailyReward` тепер використовує нову систему
- `hasReceivedDailyRewardToday` тепер використовує нову систему

---

## Приклади використання

### Отримати доступні нагороди
```typescript
const availableRewards = await rewardService.getAvailableRewards(userId);
// Повертає масив з інформацією про всі claimable нагороди
```

### Перевірити чи доступна нагорода
```typescript
const isEligible = await rewardService.isRewardEligible(userId, RewardTypeEnum.DAILY_LOGIN);
// Повертає true якщо можна клеймити
```

### Клеймити нагороду
```typescript
const result = await rewardService.claimReward(userId, RewardTypeEnum.DAILY_LOGIN);
// Повертає { success, message, pointsAwarded }
```

### Відмітити нагороду як доступну
```typescript
await rewardService.markRewardEligible(userId, RewardTypeEnum.DAILY_LOGIN);
// Створює запис в user_rewards якщо ще не існує
```

---

## Важливі деталі

1. **Один раз на день**: Кожна нагорода може бути клеймована тільки один раз на день
2. **Автоматична відмітка**: Нагороди автоматично стають доступними при виконанні дій
3. **Унікальність**: Унікальний індекс забезпечує що одна нагорода доступна один раз на день
4. **Автоматичне нарахування**: Поінти автоматично додаються при клеймуванні
5. **Перевірка доступності**: Не можна клеймити нагороду якщо не виконана відповідна дія

---

## Майбутні покращення

- Додати більше типів нагород (наприклад, за коментарі, за переглядів)
- Додати систему streak (послідовні дні логіну)
- Додати спеціальні нагороди за досягнення
- Додати історію клеймованих нагород
