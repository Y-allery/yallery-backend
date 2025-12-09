# Звіт про хардкоджені значення нагород

## Знайдені хардкоджені значення:

### 1. ⚠️ Twitter Username Update Reward
**Файл:** `src/user/user.service.ts:122`
```typescript
user.points = 200;
```
**Опис:** При оновленні Twitter username користувач отримує 200 понтів
**Рекомендація:** Додати новий тип нагороди `TWITTER_USERNAME_UPDATE_REWARD` в rewards таблицю

### 2. ⚠️ Email Update Reward
**Файл:** `src/user/user.service.ts:156`
```typescript
user.points = user.points ? user.points + 100 : 100;
```
**Опис:** При оновленні email користувач отримує 100 понтів
**Рекомендація:** Додати новий тип нагороди `EMAIL_UPDATE_REWARD` в rewards таблицю

### 3. ⚠️ Registration Bonus (YEPS_PER_REGISTRATION)
**Файл:** `src/auth/auth.service.ts:250, 449, 661, 727`
```typescript
points: this.configService.get('YEPS_PER_REGISTRATION') || 3000,
```
**Опис:** При реєстрації користувач отримує 3000 понтів (з env або fallback 3000)
**Рекомендація:** Додати новий тип нагороди `REGISTRATION_BONUS` в rewards таблицю

### 4. ⚠️ IMAGE_GENERATE_SPEND fallback
**Файл:** `src/activity/activity.service.ts:182`
```typescript
return +this.configService.get('IMAGE_GENERATE_SPEND_YEPS') || 0;
```
**Опис:** Fallback для IMAGE_GENERATE_SPEND (хоча вартість береться з ai_settings)
**Рекомендація:** Це не використовується в реальності, бо вартість береться з ai_settings, але можна прибрати

### 5. ⚠️ Video Generation fallback values
**Файл:** `src/video-generation/video-generation.service.ts:89, 103, 109`
```typescript
cost: 100,
```
**Опис:** Fallback значення для відображення в getAllAISettings, якщо немає в БД
**Рекомендація:** Це тільки для UI, якщо немає налаштувань в БД. Можна залишити або зробити 0

### 6. ⚠️ Admin Statistics - productPointsMap
**Файл:** `src/admin/admin.service.ts:311-313`
```typescript
const productPointsMap: { [key: string]: number } = {
  '5000yeps': 5000,
  '15000yeps': 15000,
  '30000yeps': 30000,
};
```
**Опис:** Використовується для розрахунку статистики куплених понтів
**Рекомендація:** Можна використовувати RewardService для отримання значень

### 7. ✅ Fallback значення в getRewardPointsOrDefault
**Файли:** Різні сервіси
```typescript
await this.rewardService.getRewardPointsOrDefault(RewardTypeEnum.DAILY_REWARD, 10);
```
**Опис:** Fallback значення для нагород (10, 5, 15, 500, 100)
**Статус:** ✅ Це нормально - це fallback на випадок, якщо нагорода не знайдена в БД

---

## Потрібно виправити:

1. **Twitter Username Update** - додати в rewards таблицю
2. **Email Update** - додати в rewards таблицю  
3. **Registration Bonus** - додати в rewards таблицю
4. **Admin Statistics** - використовувати RewardService замість хардкоду

---

## Не потрібно виправляти:

1. **Fallback значення в getRewardPointsOrDefault** - це нормально для безпеки
2. **Video Generation fallback в getAllAISettings** - це тільки для UI, якщо немає в БД
3. **IMAGE_GENERATE_SPEND fallback** - не використовується в реальності
