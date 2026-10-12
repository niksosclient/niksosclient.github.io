// ===== Настройки сайта Niksos — правь только здесь =====
window.NIKSOS = {
  // Supabase: Project URL и publishable (anon) key — те же, что в CloudServer.java
  supabaseUrl: "https://hehzcromcdjyiyqsgvyc.supabase.co",
  supabaseKey: "sb_publishable_RUurG4Nyg4bHxmb4eE7nLg_RaJ6PvAi",
  // Способы оплаты на сайте (порядок = порядок кнопок): "anypay", "rollypay"
  pay: ["rollypay"],
  // Поддержка (показывается на support.html, в соглашении и политике). Пустое — не показывается.
  support: {
    telegram: "@niksos_support",   // например "@niksos_support"
    email: "sskyn1xx@gmail.com",      // например "support@mail.ru"
  },
  // Медиа-программа (media.html). Список медиа берётся из облака (одобренные заявки),
  // а сюда можно вписать тех, кого добавляешь вручную: { name, platform: "youtube"|"tiktok"|"twitch", url, subs }
  media: {
    perks: [
      ["Клиент бесплатно", "Подписка Niksos на всё время сотрудничества — продлеваем, пока выходят ролики."],
      ["Свой промокод", "Личный промокод со скидкой для зрителей — и бонусы за каждую активацию."],
      ["Ранний доступ", "Новые функции и косметика раньше всех — можно снимать первым."],
      ["Место на сайте", "Карточка канала в разделе «Медиа» и упоминание в Discord."],
    ],
    requirements: [
      "YouTube — от 300 подписчиков или ролик от 1000 просмотров",
      "TikTok / Shorts — от 1000 подписчиков",
      "Twitch — средний онлайн от 15 зрителей",
      "Минимум 1 ролик/стрим с Niksos в месяц, ссылка на сайт в описании",
    ],
    creators: [],
  },
  links: {
    funpay: "-",   // ссылка на твой лот / профиль на FunPay
    discord: "https://discord.gg/tUryKysJVT",  // инвайт в Discord
  },
};
