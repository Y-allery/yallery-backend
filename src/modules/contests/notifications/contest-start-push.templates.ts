import { SupportedLocale } from 'src/modules/translations/translation.catalog';

/**
 * Static push copy for the contest-start notification, one entry per app
 * locale. {name} is replaced with the (translated) contest name.
 */
export const CONTEST_START_PUSH_TEMPLATES: Record<
  SupportedLocale,
  { title: string; body: string }
> = {
  en: {
    title: 'Join the contest!',
    body: 'The {name} contest is now live! Join now for a chance to win points!',
  },
  uk: {
    title: 'Долучайся до конкурсу!',
    body: 'Конкурс «{name}» вже стартував! Бери участь і вигравай поїнти!',
  },
  ru: {
    title: 'Присоединяйся к конкурсу!',
    body: 'Конкурс «{name}» уже стартовал! Участвуй и выигрывай поинты!',
  },
  es: {
    title: '¡Únete al concurso!',
    body: '¡El concurso {name} ya está en marcha! ¡Participa y gana puntos!',
  },
  pl: {
    title: 'Dołącz do konkursu!',
    body: 'Konkurs {name} właśnie wystartował! Weź udział i wygraj punkty!',
  },
  tr: {
    title: 'Yarışmaya katıl!',
    body: '{name} yarışması başladı! Katıl ve puan kazanma şansı yakala!',
  },
  ar: {
    title: 'انضم إلى المسابقة!',
    body: 'انطلقت مسابقة {name} الآن! شارك واربح النقاط!',
  },
  ja: {
    title: 'コンテストに参加しよう！',
    body: '「{name}」コンテストが開催中！参加してポイントを獲得しよう！',
  },
  ko: {
    title: '콘테스트에 참여하세요!',
    body: '{name} 콘테스트가 시작되었습니다! 지금 참여하고 포인트를 획득하세요!',
  },
  zh: {
    title: '快来参加比赛吧！',
    body: '{name} 比赛现已开始！立即参加，赢取积分！',
  },
};
