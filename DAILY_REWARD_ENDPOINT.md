# Daily Reward Endpoint

## Опис

Новий ендпоінт для отримання щоденних нагород користувачами. Користувач може отримати щоденну нагороду один раз на день. **Система автоматично бере кількість YEPs з змінної середовища без ручного вказання в коді.**

## Ендпоінт

```
POST /activity/claim-daily-reward
```

## Заголовки

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

## Відповідь

### Успішна відповідь (200 OK)

```json
{
  "success": true,
  "message": "Successfully claimed daily reward of 100 YEPs!",
  "pointsAwarded": 100
}
```

### Відповідь, якщо нагорода вже отримана (200 OK)

```json
{
  "success": false,
  "message": "You have already received your daily reward today. Come back tomorrow!",
  "pointsAwarded": 0
}
```

## Логіка роботи

1. **Перевірка**: Система перевіряє, чи користувач вже отримав щоденну нагороду сьогодні
2. **Автоматичне отримання нагороди**: Якщо нагорода ще не отримана, система:
   - **Автоматично** отримує кількість YEPs з змінної середовища `DAILY_REWARD_YEPS`
   - Створює запис активності типу `DAILY_REWARD`
   - Нараховує YEPs користувачу (кількість налаштовується в змінній середовища)
   - Відправляє WebSocket повідомлення про оновлення профілю
3. **Обмеження**: Користувач може отримати щоденну нагороду тільки один раз на день (з 00:00 до 23:59)

## Конфігурація

Кількість YEPs за щоденну нагороду **автоматично** налаштовується в змінній середовища:

```env
DAILY_REWARD_YEPS=100
```

**Важливо**: Немає потреби вручну вказувати кількість YEPs в коді - система автоматично бере значення з `.env` файлу.

## WebSocket оновлення

Після успішного отримання нагороди, профіль користувача автоматично оновлюється через WebSocket з подією `profileUpdate`.

## Приклад використання

### JavaScript/TypeScript

```typescript
const response = await fetch('/activity/claim-daily-reward', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const result = await response.json();
console.log(result.message); // "Successfully claimed daily reward of 100 YEPs!"
```

### cURL

```bash
curl -X POST http://localhost:3000/activity/claim-daily-reward \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

## Інтеграція з профілем

Ендпоінт профілю (`GET /user/profile`) містить поле `hasReceivedDailyRewardToday`, яке показує, чи користувач вже отримав щоденну нагороду сьогодні.

## Безпека

- Ендпоінт захищений JWT автентифікацією
- Користувач може отримати нагороду тільки для свого акаунту
- Система автоматично перевіряє обмеження "один раз на день"
- Кількість YEPs береться з безпечної змінної середовища

## Автоматизація

✅ **Автоматичне отримання кількості YEPs** з змінної середовища  
✅ **Автоматичне створення активності** з правильними очками  
✅ **Автоматичне генерування повідомлення** з актуальною кількістю YEPs  
✅ **Автоматичне оновлення профілю** через WebSocket  

## Зміна кількості YEPs

Щоб змінити кількість YEPs за щоденну нагороду:

1. Відредагуйте файл `.env`
2. Змініть значення `DAILY_REWARD_YEPS`
3. Перезапустіть додаток
4. Нова кількість автоматично застосується

**Приклад:**
```env
# Поточне значення
DAILY_REWARD_YEPS=100

# Нове значення
DAILY_REWARD_YEPS=50
```
