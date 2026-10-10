// ===== Настройки сайта Niksos — правь только здесь =====
window.NIKSOS = {
  // Supabase: Project URL и publishable (anon) key — те же, что в CloudServer.java
  supabaseUrl: "https://hehzcromcdjyiyqsgvyc.supabase.co",
  supabaseKey: "sb_publishable_RUurG4Nyg4bHxmb4eE7nLg_RaJ6PvAi",
  // Способы оплаты на сайте (порядок = порядок кнопок): "anypay", "rollypay"
  pay: ["rollypay"],
  // Поддержка (показывается на support.html, в соглашении и политике). Пустое — не показывается.
  support: {
    telegram: "",   // например "@niksos_support"
    email: "",      // например "support@mail.ru"
  },
  links: {
    funpay: "#",   // ссылка на твой лот / профиль на FunPay
    discord: "#",  // инвайт в Discord
  },
};
