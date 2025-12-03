# Оптимізація продуктивності додатку

## 🔴 КРИТИЧНО: N+1 проблеми в запитах

### 1. `getPosts()` - найбільш критична проблема

**Проблема**: Для кожного поста виконується 2 окремі підзапити:
- `(SELECT COUNT(*) FROM likes WHERE postId = p.id)` - для like_count
- `EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId})` - для is_liked

**Поточний код** (`src/post/post.service.ts:84-89`):
```sql
(SELECT COUNT(*) FROM likes WHERE postId = p.id) AS like_count,
CASE 
  WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId}) 
  THEN TRUE 
  ELSE FALSE 
END AS is_liked,
```

**Ризик**: 
- При 20 постах = 40+ додаткових запитів
- При 100 постах = 200+ додаткових запитів
- Час виконання: ~200ms → ~2000ms (10x повільніше)

**Рішення**: Використовувати LEFT JOIN з агрегацією:
```sql
SELECT 
  p.id,
  p.imageUrl AS image_url,
  p.videoUrl AS video_url,
  p.createdAt AS created_at,
  u.id AS user_id,
  t.id AS tag_id,
  CONCAT('#', t.name) AS tag_name,
  COUNT(DISTINCT l.id) AS like_count,
  MAX(CASE WHEN l.userId = :userId THEN 1 ELSE 0 END) AS is_liked,
  FALSE AS is_viewed,
  p.generation_params
FROM posts p
JOIN users u ON p.userId = u.id
JOIN tags t ON p.tagId = t.id
LEFT JOIN likes l ON p.id = l.postId
WHERE 
  p.is_published = true 
  AND p.is_blocked = false
  AND NOT EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = :userId)
  AND p.tagId IN (
    SELECT tagsId FROM users_tags_tags WHERE usersId = :userId
  )
  AND (:cursor IS NULL OR p.id < :cursor)
GROUP BY p.id, u.id, t.id, p.imageUrl, p.videoUrl, p.createdAt, p.generation_params
ORDER BY p.id DESC
LIMIT :limit;
```

**Очікуваний ефект**: 
- З 200+ запитів до 1 запиту
- Час виконання: з ~2000ms до ~50ms (40x швидше)

---

### 2. `getPopularPosts()` - аналогічна проблема

**Проблема**: Три окремі запити (today, yesterday, all_time) з N+1 проблемами в кожному.

**Поточний код** (`src/activity/activity.service.ts:475-515`):
```sql
(SELECT COUNT(*) FROM likes WHERE postId = p.id) AS like_count,
(SELECT COUNT(*) FROM viewed_posts WHERE postId = p.id) AS view_count,
CASE WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId}) THEN TRUE ELSE FALSE END AS is_liked,
```

**Рішення**: Об'єднати в один запит з UNION ALL або використати JOIN:
```sql
SELECT 
  p.id,
  COUNT(DISTINCT l.id) AS like_count,
  COUNT(DISTINCT v.id) AS view_count,
  MAX(CASE WHEN l.userId = :userId THEN 1 ELSE 0 END) AS is_liked,
  MAX(CASE WHEN v.userId = :userId THEN 1 ELSE 0 END) AS is_viewed,
  CASE 
    WHEN p.createdAt >= CURDATE() THEN 'today'
    WHEN p.createdAt >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN 'yesterday'
    ELSE 'all_time'
  END AS period
FROM posts p
LEFT JOIN likes l ON p.id = l.postId
LEFT JOIN viewed_posts v ON p.id = v.postId
WHERE 
  p.is_published = true 
  AND p.is_blocked = false
  AND p.is_rejected = false
  AND (p.imageUrl IS NOT NULL OR p.videoUrl IS NOT NULL)
GROUP BY p.id
ORDER BY like_count DESC, view_count DESC
LIMIT 6;
```

**Очікуваний ефект**: 
- З 3 запитів × 6 постів × 3 підзапити = 54 запити до 1 запиту
- Час виконання: з ~500ms до ~30ms (16x швидше)

---

### 3. `getPostsByContest()` - часткова оптимізація

**Проблема**: Використовує JOIN для likes, але все ще має EXISTS підзапити для is_liked та is_viewed.

**Рішення**: Замінити EXISTS на JOIN:
```sql
LEFT JOIN likes l ON p.id = l.postId
LEFT JOIN likes user_like ON p.id = user_like.postId AND user_like.userId = :userId
LEFT JOIN viewed_posts v ON p.id = v.postId AND v.userId = :userId
...
MAX(CASE WHEN user_like.id IS NOT NULL THEN 1 ELSE 0 END) AS is_liked,
MAX(CASE WHEN v.id IS NOT NULL THEN 1 ELSE 0 END) AS is_viewed,
```

---

## 🔴 КРИТИЧНО: SQL Injection вразливості

**Проблема**: Пряма інтерполяція змінних в SQL запити.

**Місця**:
1. `src/post/post.service.ts:73,86,99,103` - `getPosts()`
2. `src/activity/activity.service.ts:491,496,506` - `getPopularPosts()`
3. `src/contest/contest.service.ts:214,219,240` - `getPostsByContest()`

**Рішення**: Використовувати параметризовані запити через TypeORM QueryBuilder:
```typescript
// Замість:
const cursorCondition = cursor ? `AND p.id < ${cursor}` : '';

// Використовувати:
.andWhere(':cursor IS NULL OR p.id < :cursor', { cursor })
```

**Пріоритет**: НЕГАЙНО (безпека)

---

## 🟠 ВИСОКИЙ: Відсутність кешування

### 1. Кешування тегів (Tags)

**Проблема**: Теги рідко змінюються, але запитуються в кожному `getPosts()`.

**Рішення**: Додати Redis кеш:
```typescript
// Встановити @nestjs/cache-manager та cache-manager-redis-store
@Injectable()
export class TagService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    ...
  ) {}

  async findAll(): Promise<any[]> {
    const cacheKey = 'tags:all';
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const tags = await this.tagModel.createQueryBuilder(...).getRawMany();
    await this.cacheManager.set(cacheKey, tags, { ttl: 3600 }); // 1 година
    return tags;
  }
}
```

**Очікуваний ефект**: 
- Зменшення навантаження на БД на 80-90%
- Прискорення запитів тегів з ~50ms до ~1ms (50x швидше)

---

### 2. Кешування user tags (підписки користувача)

**Проблема**: `p.tagId IN (SELECT tagsId FROM users_tags_tags WHERE usersId = ${userId})` виконується для кожного запиту.

**Рішення**: Кешувати підписки користувача на 5-10 хвилин:
```typescript
async getUserSubscribedTags(userId: number): Promise<number[]> {
  const cacheKey = `user:${userId}:tags`;
  const cached = await this.cacheManager.get<number[]>(cacheKey);
  if (cached) return cached;

  const tags = await this.userTagsRepository.find({
    where: { usersId: userId },
    select: ['tagsId'],
  });
  const tagIds = tags.map(t => t.tagsId);
  await this.cacheManager.set(cacheKey, tagIds, { ttl: 600 }); // 10 хвилин
  return tagIds;
}
```

**Очікуваний ефект**: 
- Прискорення getPosts() на 20-30%
- Зменшення навантаження на БД

---

### 3. Кешування admin метрик

**Проблема**: Admin метрики оновлюються раз на годину, але можуть запитуватися часто.

**Рішення**: Кешувати результат на 5 хвилин:
```typescript
async getAdminMetricsOverview() {
  const cacheKey = 'admin:metrics:latest';
  const cached = await this.cacheManager.get(cacheKey);
  if (cached) return cached;

  const latest = await this.adminMetricsRepository
    .createQueryBuilder('m')
    .orderBy('m.snapshotTime', 'DESC')
    .limit(1)
    .getOne();
  
  const result = { ... };
  await this.cacheManager.set(cacheKey, result, { ttl: 300 }); // 5 хвилин
  return result;
}
```

---

## 🟠 ВИСОКИЙ: Оптимізація `getUserProfile()`

**Проблема**: Метод робить 5+ окремих запитів до БД (`src/user/user.service.ts:582-622`):
1. `findById(userId)` - отримання користувача
2. `countUnreadActivities(userId)` - підрахунок активностей
3. `countUnreadContestActivities(userId)` - підрахунок contest активностей
4. `countUnreadCollabsActivities(userId)` - підрахунок collabs активностей
5. `hasReceivedDailyRewardToday(userId)` - перевірка daily reward
6. `findOne({ where: { userId } })` - отримання partner link

**Рішення**: Об'єднати в один запит або використати Promise.all:
```typescript
async getUserProfile(userId: number) {
  const [
    user,
    unreadCount,
    unreadContestActivity,
    unreadCollabsActivity,
    hasReceivedDailyRewardToday,
    partnerUserLink,
  ] = await Promise.all([
    this.findById(userId),
    this.activityService.countUnreadActivities(userId),
    this.activityService.countUnreadContestActivities(userId),
    this.activityService.countUnreadCollabsActivities(userId),
    this.activityService.hasReceivedDailyRewardToday(userId),
    this.partnerUserLinkRepository.findOne({ where: { userId } }),
  ]);

  // ... решта коду
}
```

**Очікуваний ефект**: 
- З 5+ послідовних запитів до 5 паралельних
- Час виконання: з ~150ms до ~50ms (3x швидше)

---

## 🟠 ВИСОКИЙ: Оптимізація admin метрик (вже частково зроблено)

**Проблема**: `collectAdminMetricsSnapshot()` виконує багато окремих запитів.

**Поточний стан**: Вже використовується `Promise.all` для паралельних запитів ✅

**Додаткові оптимізації**:
1. Використовувати `COUNT(*)` замість `getCount()` де можливо
2. Об'єднати подібні запити (image/video posts)
3. Додати try-catch з логуванням помилок

---

## 🟡 СЕРЕДНІЙ: Оптимізація connection pooling

**Проблема**: Можливо недостатньо з'єднань для високого навантаження.

**Рішення**: Перевірити та налаштувати poolSize в `data-source.ts`:
```typescript
poolSize: 20, // замість 10 (якщо потрібно)
maxQueryExecutionTime: 5000, // таймаут для повільних запитів
```

---

## 🟡 СЕРЕДНІЙ: Batch операції для likes/viewed_posts

**Проблема**: При масових операціях (наприклад, відмітка всіх постів як переглянуті) виконуються окремі INSERT.

**Рішення**: Використовувати batch INSERT:
```typescript
// Замість:
for (const postId of postIds) {
  await this.viewedPostRepository.save({ postId, userId });
}

// Використовувати:
await this.viewedPostRepository
  .createQueryBuilder()
  .insert()
  .into(ViewedPostEntity)
  .values(postIds.map(postId => ({ postId, userId })))
  .orIgnore() // щоб уникнути дублікатів
  .execute();
```

**Очікуваний ефект**: 
- При 100 постах: з ~2000ms до ~50ms (40x швидше)

---

## 🟡 СЕРЕДНІЙ: Оптимізація `getTopPostForEachContest()`

**Проблема**: Складний CTE запит з ROW_NUMBER() може бути повільним.

**Рішення**: 
1. Додати індекси (вже в міграції)
2. Розглянути матеріалізований view для топ постів
3. Кешувати результат на 5-10 хвилин

---

## 📊 Пріоритети оптимізації:

### НЕГАЙНО (критично):
1. **Виправити SQL Injection** - безпека
2. **Оптимізувати getPosts()** - N+1 проблема (найбільш використовуваний endpoint)
3. **Оптимізувати getPopularPosts()** - N+1 проблема

### ШВИДКО (високий пріоритет):
4. **Додати кешування тегів** - легко реалізувати, великий ефект
5. **Оптимізувати getUserProfile()** - Promise.all
6. **Додати кешування user tags** - для getPosts()

### ПОТІМ (середній пріоритет):
7. **Додати кешування admin метрик**
8. **Оптимізувати batch операції**
9. **Налаштувати connection pooling**

---

## 📈 Очікуваний загальний ефект:

### Після виправлення N+1 проблем:
- **getPosts()**: з ~2000ms до ~50ms (40x швидше)
- **getPopularPosts()**: з ~500ms до ~30ms (16x швидше)
- **getPostsByContest()**: з ~300ms до ~40ms (7x швидше)

### Після додавання кешування:
- **Запити тегів**: з ~50ms до ~1ms (50x швидше)
- **getPosts()**: додаткове прискорення на 20-30%
- **Admin метрики**: з ~50ms до ~1ms (50x швидше)

### Загальне навантаження на БД:
- **Зменшення на 70-80%** після всіх оптимізацій
- **Збільшення пропускної здатності**: з ~100 req/s до ~500-1000 req/s

---

## 🛠️ Технічні деталі реалізації:

### 1. Встановлення Redis для кешування:
```bash
npm install @nestjs/cache-manager cache-manager cache-manager-redis-store
```

### 2. Налаштування в app.module.ts:
```typescript
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

@Module({
  imports: [
    CacheModule.register({
      store: redisStore,
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      ttl: 300, // default TTL
    }),
    // ...
  ],
})
```

### 3. Приклад використання:
```typescript
@Injectable()
export class PostService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    ...
  ) {}

  async getPosts(...) {
    // Кешування підписок користувача
    const userTags = await this.getUserSubscribedTags(userId);
    
    // Оптимізований запит з JOIN замість підзапитів
    const query = this.postEntity
      .createQueryBuilder('p')
      .leftJoin('p.likes', 'l')
      .leftJoin('likes', 'user_like', 'user_like.postId = p.id AND user_like.userId = :userId', { userId })
      .select([
        'p.id',
        'p.imageUrl',
        'COUNT(DISTINCT l.id) as like_count',
        'MAX(CASE WHEN user_like.id IS NOT NULL THEN 1 ELSE 0 END) as is_liked',
      ])
      .where('p.is_published = :published', { published: true })
      .andWhere('p.tagId IN (:...tagIds)', { tagIds: userTags })
      .groupBy('p.id')
      .orderBy('p.id', 'DESC')
      .limit(limit)
      .getRawMany();
  }
}
```

---

## ⚠️ Важливо:

1. **Тестування**: Після кожної оптимізації перевіряти:
   - Чи працює правильно
   - Чи справді прискорюється
   - Чи немає регресій

2. **Моніторинг**: Додати логування часу виконання запитів:
   ```typescript
   const start = Date.now();
   const result = await query.execute();
   const duration = Date.now() - start;
   if (duration > 1000) {
     this.logger.warn(`Slow query: ${duration}ms`, { query: query.getSql() });
   }
   ```

3. **Поступова реалізація**: Не робити всі зміни одночасно, а поступово тестувати кожну.

