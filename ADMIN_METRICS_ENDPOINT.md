## Admin metrics overview

### Загальна ідея

Цей механізм дає адмінам швидкий доступ до агрегованої статистики без важких ad‑hoc запитів напряму по бойових таблицях (`users`, `posts`, `likes` тощо).

- **Що рахуємо**: 
  - кількість нових користувачів і загальну кількість користувачів;
  - кількість нових постів, нових image‑постів, нових video‑постів;
  - загальну кількість постів (всього / тільки image / тільки video);
  - кількість активних користувачів за період (створювали пости);
  - кількість нових лайків та загальну кількість лайків.
- **Як рахуємо**: кожну годину окремий cron‑джоб рахує метрики за останню годину і записує їх у таблицю `admin_metrics`.
- **Як читаємо**: admin‑ендпоінт агрегує підготовлені рядки з `admin_metrics` за запитаний період (`from` / `to`) і повертає сумарну статистику.

---

### Таблиця `admin_metrics`

Таблиця створюється міграцією `1764700600000-create-admin-metrics.ts`.

- **Назва таблиці**: `admin_metrics`
- **Призначення**: зберігати погодинні (або будь‑які інші) зрізи ключових метрик.

**Стовпці:**

- **id** (`int`, PK, auto increment) – унікальний ідентифікатор рядка.
- **periodStart** (`datetime`, NOT NULL, indexed) – початок періоду, за який пораховано метрики (наприклад, 10:00:00).
- **periodEnd** (`datetime`, NOT NULL, indexed) – кінець періоду (наприклад, 11:00:00).
- **snapshotTime** (`datetime`, NOT NULL, default `CURRENT_TIMESTAMP`) – час, коли був зроблений цей зріз.
- **newUsers** (`int`, default 0) – скільки **нових користувачів** зареєструвалися в інтервалі `[periodStart, periodEnd)`.
- **totalUsers** (`int`, default 0) – **загальна кількість користувачів** на момент `periodEnd`.
- **newPosts** (`int`, default 0) – скільки **нових постів** створено в інтервалі `[periodStart, periodEnd)`.
- **newImagePosts** (`int`, default 0) – скільки з цих постів мають **imageUrl != null** (нові зображення).
- **newVideoPosts** (`int`, default 0) – скільки з цих постів мають **videoUrl != null** (нові відео).
- **totalPosts** (`int`, default 0) – **загальна кількість постів** на момент `periodEnd`.
- **totalImagePosts** (`int`, default 0) – **загальна кількість image‑постів** (заповнений `imageUrl`) на момент `periodEnd`.
- **totalVideoPosts** (`int`, default 0) – **загальна кількість video‑постів** (заповнений `videoUrl`) на момент `periodEnd`.
- **activeUsers** (`int`, default 0) – скільки **унікальних користувачів створювали хоч один пост** в інтервалі `[periodStart, periodEnd)`.
- **newLikes** (`int`, default 0) – скільки нових лайків поставлено за період `[periodStart, periodEnd)`.
- **totalLikes** (`int`, default 0) – **загальна кількість лайків** на момент `periodEnd`.

---

### Cron‑джоб: погодинне оновлення метрик

Реалізовано у `AdminService` за допомогою `@nestjs/schedule`.

```81:137:src/admin/admin.service.ts
@Cron(CronExpression.EVERY_HOUR)
async collectAdminMetricsSnapshot() {
  const now = new Date();
  const periodEnd = new Date(now.getTime());
  const periodStart = new Date(periodEnd.getTime() - 60 * 60 * 1000);

  const [
    newUsers,
    totalUsers,
    newPosts,
    newImagePosts,
    newVideoPosts,
    totalPosts,
    totalImagePosts,
    totalVideoPosts,
    newLikes,
    totalLikes,
  ] = await Promise.all([
    // 1) К-сть нових користувачів за період
    this.userRepository.count({
      where: {
        createdAt: {
          $gte: periodStart as any,
          $lt: periodEnd as any,
        } as any,
      } as any,
    }),
    // 2) Загальна к-сть користувачів
    this.userRepository.count(),
    // 3) Нові пости
    this.postRepository.count({
      where: {
        createdAt: {
          $gte: periodStart as any,
          $lt: periodEnd as any,
        } as any,
      } as any,
    }),
    // 4) Нові image-пости
    this.postRepository.count({
      where: {
        createdAt: {
          $gte: periodStart as any,
          $lt: periodEnd as any,
        } as any,
        imageUrl: Not(null),
      } as any,
    }),
    // 5) Нові video-пости
    this.postRepository.count({
      where: {
        createdAt: {
          $gte: periodStart as any,
          $lt: periodEnd as any,
        } as any,
        videoUrl: Not(null),
      } as any,
    }),
    // 6) Загальна к-сть постів
    this.postRepository.count(),
    // 7) Загальна к-сть image-постів
    this.postRepository.count({
      where: { imageUrl: Not(null) },
    }),
    // 8) Загальна к-сть video-постів
    this.postRepository.count({
      where: { videoUrl: Not(null) },
    }),
    // 9) Нові лайки
    this.likeRepository.count({
      where: {
        createdAt: {
          $gte: periodStart as any,
          $lt: periodEnd as any,
        } as any,
      } as any,
    }),
    // 10) Всього лайків
    this.likeRepository.count(),
  ]);

  const activeUsersRaw = await this.postRepository
    .createQueryBuilder('p')
    .select('COUNT(DISTINCT p.userId)', 'cnt')
    .where('p.createdAt >= :start AND p.createdAt < :end', {
      start: periodStart,
      end: periodEnd,
    })
    .getRawOne();

  const activeUsers = Number(activeUsersRaw?.cnt || 0);

  const snapshot = this.adminMetricsRepository.create({
    periodStart,
    periodEnd,
    newUsers,
    totalUsers,
    newPosts,
    newImagePosts,
    newVideoPosts,
    totalPosts,
    totalImagePosts,
    totalVideoPosts,
    activeUsers,
    newLikes,
    totalLikes,
  });

  await this.adminMetricsRepository.save(snapshot);
}
```

**Важливі моменти:**

- Період `periodStart/periodEnd` обчислюється як «останню годину» від поточного моменту запуску крону.
- Всі запити робляться через `Repository.count`, що дає просту й стабільну поведінку.
- Поле `totalUsers` використовується як «останнє відоме» значення загальної кількості користувачів на момент `periodEnd`.

**Можливі покращення (на майбутнє):**

- Робити період не «тепер мінус година», а базуватись на останньому snapshot у `admin_metrics`, щоб уникати дублювань у випадку збоїв/рестартів.
- Додати більше полів (наприклад, розбивку по AI‑сервісах, DAU/MAU, кількість активних користувачів за період).

---

### Admin‑ендпоінт: `GET /admin/metrics/overview`

Ендпоінт визначено в `AdminController` і доступний тільки для **ADMIN**‑ролі (успадковує загальний guard для всього `@Controller('admin')`).

```375:428:src/admin/admin.controller.ts
@Get('metrics/overview')
@ApiOperation({
  summary: 'Get aggregated admin metrics',
  description:
    'Returns high-level aggregated metrics (users and posts) for a given period. ' +
    'Data is pre-aggregated hourly by a background cron job, so this endpoint is fast even for long ranges.',
})
@ApiQuery({
  name: 'from',
  required: false,
  description:
    'Start of the period (ISO 8601). If omitted, uses the earliest available metrics snapshot.',
})
@ApiQuery({
  name: 'to',
  required: false,
  description:
    'End of the period (ISO 8601). If omitted, uses the latest available metrics snapshot.',
})
@ApiResponse({
  status: 200,
  description: 'Aggregated metrics overview returned successfully.',
})
async getAdminMetricsOverview(
  @Query('from') from?: string,
  @Query('to') to?: string,
) {
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;
  return this.adminService.getAdminMetricsOverview(fromDate, toDate);
}
```

Вся бізнес‑логіка агрегації винесена в `AdminService.getAdminMetricsOverview`.

```139:168:src/admin/admin.service.ts
async getAdminMetricsOverview(from?: Date, to?: Date) {
  const qb = this.adminMetricsRepository
    .createQueryBuilder('m')
    .select('MIN(m.periodStart)', 'from')
    .addSelect('MAX(m.periodEnd)', 'to')
    .addSelect('SUM(m.newUsers)', 'newUsers')
    .addSelect('MAX(m.totalUsers)', 'totalUsers')
    .addSelect('SUM(m.newPosts)', 'newPosts')
    .addSelect('SUM(m.newImagePosts)', 'newImagePosts')
    .addSelect('SUM(m.newVideoPosts)', 'newVideoPosts')
    .addSelect('MAX(m.totalPosts)', 'totalPosts')
    .addSelect('MAX(m.totalImagePosts)', 'totalImagePosts')
    .addSelect('MAX(m.totalVideoPosts)', 'totalVideoPosts')
    .addSelect('SUM(m.activeUsers)', 'activeUsers')
    .addSelect('SUM(m.newLikes)', 'newLikes')
    .addSelect('MAX(m.totalLikes)', 'totalLikes');

  if (from) {
    qb.andWhere('m.periodEnd >= :from', { from });
  }
  if (to) {
    qb.andWhere('m.periodStart <= :to', { to });
  }

  const raw = await qb.getRawOne();

  return {
    from: raw?.from,
    to: raw?.to,
    newUsers: Number(raw?.newUsers || 0),
    totalUsers: Number(raw?.totalUsers || 0),
    newPosts: Number(raw?.newPosts || 0),
    newImagePosts: Number(raw?.newImagePosts || 0),
    newVideoPosts: Number(raw?.newVideoPosts || 0),
    totalPosts: Number(raw?.totalPosts || 0),
    totalImagePosts: Number(raw?.totalImagePosts || 0),
    totalVideoPosts: Number(raw?.totalVideoPosts || 0),
    activeUsers: Number(raw?.activeUsers || 0),
    newLikes: Number(raw?.newLikes || 0),
    totalLikes: Number(raw?.totalLikes || 0),
  };
}
```

---

### Формат запиту

- **Метод**: `GET`
- **URL**: `/admin/metrics/overview`
- **Авторизація**: JWT + `RoleGuard`, роль `ADMIN`.

**Query‑параметри (опційні):**

- **from** (`string`, ISO 8601, опціонально)  
  Початок періоду, за який потрібно отримати статистику.  
  Наприклад: `from=2025-12-03T00:00:00.000Z`

- **to** (`string`, ISO 8601, опціонально)  
  Кінець періоду.  
  Наприклад: `to=2025-12-03T23:59:59.999Z`

Якщо `from` не переданий – береться найраніший доступний зріз.  
Якщо `to` не переданий – береться найпізніший доступний зріз.

---

### Формат відповіді

**HTTP 200 OK**

```json
{
  "from": "2025-12-03T00:00:00.000Z",
  "to": "2025-12-03T23:59:59.000Z",
  "newUsers": 123,
  "totalUsers": 4567,
  "newPosts": 789,
  "newImagePosts": 650,
  "newVideoPosts": 139,
  "totalPosts": 3400,
  "totalImagePosts": 2800,
  "totalVideoPosts": 600,
  "activeUsers": 95,
  "newLikes": 2100,
  "totalLikes": 52000
}
```

**Поля:**

- **from** – фактичний початок періоду (мінімальний `periodStart` серед відповідних записів).
- **to** – фактичний кінець періоду (максимальний `periodEnd`).
- **newUsers** – сума всіх `newUsers` по snapshot‑ах у діапазоні.
- **totalUsers** – найбільше (останнє) значення `totalUsers` по snapshot‑ах у діапазоні.
-- **newPosts** – сума всіх `newPosts`.
-- **newImagePosts** – сума всіх `newImagePosts`.
-- **newVideoPosts** – сума всіх `newVideoPosts`.
-- **totalPosts** – найбільше (останнє) значення `totalPosts` у діапазоні (тобто стан на кінець періоду).
-- **totalImagePosts** – найбільше (останнє) значення `totalImagePosts` у діапазоні.
-- **totalVideoPosts** – найбільше (останнє) значення `totalVideoPosts` у діапазоні.
-- **activeUsers** – сума `activeUsers` за всі snapshot‑и в діапазоні (наближена к-сть активних user‑годин).
-- **newLikes** – сума всіх `newLikes` (скільки лайків поставили у вибраному періоді).
-- **totalLikes** – найбільше (останнє) значення `totalLikes` у діапазоні.

Якщо у вказаному діапазоні немає жодного snapshot‑а, всі числові значення повертаються як `0`, а `from` / `to` будуть `null`.

---

### Обмеження та зауваження

- Точність метрик залежить від **частоти крону** і того, наскільки стабільно він відпрацьовує (якщо крон зупинений годинами, будуть «дірки» в даних).
- Поточна реалізація обчислює зріз **на основі "остання година від поточного часу"**, а не на основі останнього snapshot – це простіше, але може створити дублікати в таблиці при повторному запуску крону. Для продакшен‑рішення варто:
  - або робити `UPSERT` по унікальному ключу `(periodStart, periodEnd)`,
  - або перед вставкою видаляти наявний рядок з тим самим інтервалом.
- Зараз метрики охоплюють тільки **юзерів і пости (image/video)**.  
  При потребі можна:
  - додати стовпці для генерацій по AI‑сервісах (image/video);
  - рахувати DAU/WAU/MAU за період (через унікальних юзерів, які створили пости / мали активності).


