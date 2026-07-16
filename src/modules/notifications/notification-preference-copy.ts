import { SupportedLocale } from 'src/modules/translations/translation.catalog';

/**
 * User-facing copy for the notification-preference toggles, per app locale.
 * Static (not admin content), so it lives in code like the push templates.
 */
export const NOTIFICATION_PREFERENCE_COPY: Record<
  SupportedLocale,
  Record<string, string>
> = {
  en: {
    LIKE_EARN: 'Points earned from likes',
    LIKE_SPEND: 'Points spent on likes',
  },
  uk: {
    LIKE_EARN: 'Поїнти, зароблені за лайки',
    LIKE_SPEND: 'Поїнти, витрачені на лайки',
  },
  ru: {
    LIKE_EARN: 'Поинты, заработанные за лайки',
    LIKE_SPEND: 'Поинты, потраченные на лайки',
  },
  es: {
    LIKE_EARN: 'Puntos ganados por «me gusta»',
    LIKE_SPEND: 'Puntos gastados en «me gusta»',
  },
  pl: {
    LIKE_EARN: 'Punkty zdobyte za polubienia',
    LIKE_SPEND: 'Punkty wydane na polubienia',
  },
  tr: {
    LIKE_EARN: 'Beğenilerden kazanılan puanlar',
    LIKE_SPEND: 'Beğenilere harcanan puanlar',
  },
  ar: {
    LIKE_EARN: 'النقاط المكتسبة من الإعجابات',
    LIKE_SPEND: 'النقاط المستخدمة على الإعجابات',
  },
  ja: {
    LIKE_EARN: 'いいねで獲得したポイント',
    LIKE_SPEND: 'いいねで使ったポイント',
  },
  ko: {
    LIKE_EARN: '좋아요로 획득한 포인트',
    LIKE_SPEND: '좋아요에 사용한 포인트',
  },
  zh: {
    LIKE_EARN: '通过点赞获得的积分',
    LIKE_SPEND: '点赞消耗的积分',
  },
};
