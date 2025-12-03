# Критичні проблеми, які можуть "ложити" сервер

## 🔴 КРИТИЧНО: SQL Injection вразливості

### 1. `src/post/post.service.ts:72-109` - метод `getPosts()`
**Проблема**: Пряма інтерполяція `userId` та `cursor` в SQL без параметризації
```typescript
const cursorCondition = cursor ? `AND p.id < ${cursor}` : '';
// ...
WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId})
```
**Ризик**: SQL Injection атака може:
- Видалити дані
- Отримати доступ до чужих даних
- Заблокувати БД довгими запитами

**Рішення**: Використовувати параметризовані запити:
```typescript
.andWhere('p.id < :cursor', { cursor })
.andWhere('EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = :userId)', { userId })
```

### 2. `src/activity/activity.service.ts:475-515` - метод `getPopularPosts()`
**Проблема**: Інтерполяція `userId` та дат в SQL
```typescript
WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId})
p.createdAt >= '${today.toISOString()}'
```
**Ризик**: Те саме що вище

### 3. `src/contest/contest.service.ts:239-240` - метод `getPostsByContest()`
**Проблема**: Інтерполяція `contest.winner.id`
```typescript
orderByClause = ` ORDER BY (p.userId = ${contest.winner.id}) DESC, p.createdAt DESC`;
```
**Ризик**: Те саме

---

## 🔴 КРИТИЧНО: Високий concurrency в чергах

### Проблема: 60 одночасних джобів в 6 чергах
- `flux.queue.processor.ts`: concurrency: 60
- `aura.queue.processor.ts`: concurrency: 60
- `realistic-vision.queue.processor.ts`: concurrency: 60
- `bytedance-edit.queue.processor.ts`: concurrency: 60
- `flux.pro.fine.tune.ts`: concurrency: 60
- `byty-dance.processor.ts`: concurrency: 60

**Ризик**: 
- 360 одночасних HTTP запитів до зовнішніх API
- Вичерпання пам'яті (кожен джоб завантажує зображення)
- Вичерпання з'єднань до БД (poolSize: 10, але 360 джобів)
- Блокування сервера через навантаження на CPU/IO

**Рішення**: 
- Зменшити concurrency до 5-10 на чергу
- Додати rate limiting на рівні API клієнта
- Додати обмеження на загальну кількість активних джобів

---

## 🟠 ВИСОКИЙ: Відсутність обмежень на LIMIT

### `src/post/post.service.ts:72` - метод `getPosts()`
**Проблема**: `limit` передається без валідації
```typescript
LIMIT ${limit};
```

**Ризик**: 
- Користувач може передати `limit: 1000000`
- Завантаження мільйонів записів в пам'ять
- Блокування БД на довгий час
- OOM (Out of Memory) помилка

**Рішення**:
```typescript
const safeLimit = Math.min(Math.max(limit || 20, 1), 100); // мінімум 1, максимум 100
```

---

## 🟠 ВИСОКИЙ: Проблеми з транзакціями

### `src/user/user.service.ts:254-314` - метод `deleteUserAccount()`
**Проблема**: Якщо помилка виникне після `commitTransaction()` але до `release()`, queryRunner може залишитися не звільненим

**Ризик**: 
- Витоки з'єднань до БД
- Блокування пулу з'єднань
- Неможливість обробляти нові запити

**Рішення**: Гарантувати `release()` в `finally` (вже є, але треба перевірити всі місця)

---

## 🟠 ВИСОКИЙ: N+1 проблеми в запитах

### `src/post/post.service.ts:84-89`
**Проблема**: Для кожного поста виконується окремий підзапит для `like_count` та `is_liked`
```sql
(SELECT COUNT(*) FROM likes WHERE postId = p.id) AS like_count,
WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId})
```

**Ризик**: 
- При 100 постах = 200+ додаткових запитів
- Повільна робота БД
- Високе навантаження на CPU БД

**Рішення**: Використовувати JOIN з агрегацією:
```sql
LEFT JOIN likes l ON p.id = l.postId
COUNT(DISTINCT l.id) AS like_count
```

---

## 🟡 СЕРЕДНІЙ: Проблеми з пам'яттю в Puppeteer

### `src/common/puppeteer-browser.ts`
**Проблема**: 
- Браузер може не закриватися при помилках
- Накопичення тимчасових файлів (`/tmp/puppeteer-profile-*`)
- Використання великої кількості пам'яті

**Ризик**: 
- Вичерпання дискового простору
- Вичерпання пам'яті
- Блокування сервера

**Рішення**: 
- Додати обмеження на кількість одночасних браузерів
- Додати таймаути на операції
- Гарантувати cleanup в `finally` блоках

---

## 🟡 СЕРЕДНІЙ: Відсутність обробки помилок в кронах

### `src/admin/admin.service.ts:85` - `collectAdminMetricsSnapshot()`
**Проблема**: Якщо крон падає, помилка не логується, snapshot не створюється

**Ризик**: 
- Накопичення помилок
- Відсутність метрик
- Неможливість діагностувати проблеми

**Рішення**: Додати try-catch з логуванням:
```typescript
try {
  // ... код
} catch (error) {
  this.logger.error('Failed to collect admin metrics', error);
  throw error; // щоб крон помітив помилку
}
```

---

## 🟡 СЕРЕДНІЙ: Відсутність обмежень на розмір даних

### `src/image-generation/image-generation.service.ts:543`
**Проблема**: Завантаження масивів зображень без обмежень
```typescript
console.log(`[X-Router] Received ${data.images.length} images`);
const uploadPromises = data.images.map(...)
```

**Ризик**: 
- Якщо API поверне 1000+ зображень, сервер може впасти
- Вичерпання пам'яті
- Блокування на завантаженні

**Рішення**: 
```typescript
const maxImages = 10;
const imagesToProcess = data.images.slice(0, maxImages);
```

---

## Пріоритети виправлення:

1. **НЕГАЙНО**: SQL Injection вразливості (безпека)
2. **НЕГАЙНО**: Зменшити concurrency в чергах (стабільність)
3. **ШВИДКО**: Додати обмеження на LIMIT (захист від DoS)
4. **ШВИДКО**: Виправити N+1 проблеми (продуктивність)
5. **ПОТІМ**: Покращити обробку помилок в кронах
6. **ПОТІМ**: Додати обмеження на розмір даних

