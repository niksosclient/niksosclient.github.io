// Purchase confirmation. All prices and discounts come from niksos-pay → PostgreSQL.
(function(){
 const $=id=>document.getElementById(id),dialog=$("checkoutDialog");if(!dialog)return;
 const titles={"7d":"7 дней","30d":"30 дней","90d":"90 дней",forever:"Навсегда",beta:"Beta — разовое дополнение"};
 const errors={already_beta:"Бета уже куплена на этом аккаунте. Обнови кабинет.",no_license:"Для покупки Беты нужна активная основная подписка.",bad_plan:"Этот тариф недоступен.",discount_invalid:"Промокод не найден или отключён.",discount_expired:"Срок действия промокода истёк.",discount_plan:"Промокод не действует на выбранный тариф.",discount_used:"Этот промокод уже использован или закреплён за твоим заказом.",discount_limit:"Лимит промокода исчерпан или занят незавершёнными заказами.",net:"Нет связи с сервером. Попробуй ещё раз.",not_configured:"Оплата пока не настроена. Напиши в поддержку.",too_many:"Слишком много заказов. Попробуй позже.",wrong:"Сессия недействительна. Войди в профиль заново.",locked:"Слишком много попыток. Подожди 10 минут.",banned:"Аккаунт заблокирован.",pay_error:"Не удалось создать платёж. Попробуй позже.",error:"Не удалось получить ответ. Попробуй ещё раз."};
 let cart=null,quote=null,revision=0,paying=false,requestId=null,returnFocus=null;
 const money=n=>Number(n).toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2})+" ₽";
 function message(text="",kind=""){const el=$("checkoutFeedback");el.textContent=text;el.dataset.kind=kind;}
 function code(){return $("checkoutCode").value.trim().toUpperCase();}
 function invalidate(){quote=null;requestId=null;$("checkoutPay").disabled=true;$("checkoutPay").textContent="Сначала проверь стоимость";$("checkoutTotal").textContent="—";$("checkoutDiscountRow").hidden=true;$("checkoutBase").textContent="—";$("checkoutRemove").hidden=true;}
 function paint(q){
  quote=q;$("checkoutBase").textContent=money(q.base_amount);$("checkoutTotal").textContent=money(q.amount);
  $("checkoutDiscountRow").hidden=!q.percent;$("checkoutDiscountLabel").textContent="Скидка "+q.percent+"%";
  $("checkoutDiscount").textContent="−"+money(q.discount_amount);$("checkoutRemove").hidden=!q.code;
  $("checkoutPay").textContent="Оплатить "+money(q.amount);$("checkoutPay").disabled=false;
 }
 async function apply(){
  if(!cart||paying)return;const rev=++revision;invalidate();message("Проверяем стоимость…");
  $("checkoutApply").disabled=true;const activeCart=cart;
  try{
   const q=await NiksosApi.quote(activeCart.session.name,activeCart.session.hash,activeCart.plan,code());
   if(rev!==revision||!dialog.open||cart!==activeCart)return;
   if(q.status!=="ok"){message(errors[q.status]||"Не удалось проверить стоимость.","err");return;}
   if(!Number.isFinite(Number(q.amount))||Number(q.amount)<=0||!Number.isFinite(Number(q.base_amount)))throw new Error("bad quote");
   paint(q);message(q.code?"Промокод "+q.code+" применён. Скидка учтена в итоговой сумме.":"Можно оплатить без промокода.",q.code?"ok":"");
  }catch{if(rev===revision)message(errors.net,"err");}
  finally{if(rev===revision)$("checkoutApply").disabled=false;}
 }
 function close(){if(paying)return;revision++;dialog.close();cart=null;quote=null;requestId=null;if(returnFocus?.isConnected)returnFocus.focus();}
 window.NiksosCheckout={open(options){
  if(paying||!titles[options.plan])return;
  returnFocus=document.activeElement;cart=options;revision++;paying=false;$("checkoutCode").value="";invalidate();
  $("checkoutPlan").textContent=titles[cart.plan]+(cart.plan==="beta"?" · действует вместе с основной подпиской":"");$("checkoutProfile").textContent=cart.session.name;
  $("checkoutProvider").textContent=(cart.provider==="rollypay"?"RollyPay":"AnyPay")+(cart.test?" · тестовый платёж":"");
  $("checkoutPay").textContent="Получаем стоимость…";dialog.showModal();$("checkoutCode").disabled=cart.plan==="beta";if(cart.plan==="beta")$("checkoutPay").focus();else $("checkoutCode").focus();apply();
 },close};
 $("checkoutForm").addEventListener("submit",e=>{e.preventDefault();apply();});
 $("checkoutCode").addEventListener("input",()=>{revision++;invalidate();$("checkoutApply").disabled=false;message(code()?"Нажми «Применить», чтобы проверить промокод.":"Нажми «Применить», чтобы обновить стоимость.");});
 $("checkoutRemove").addEventListener("click",()=>{$("checkoutCode").value="";apply();});
 $("checkoutClose").addEventListener("click",close);
 dialog.addEventListener("cancel",e=>{e.preventDefault();close();});
 $("checkoutPay").addEventListener("click",async()=>{
  if(paying||!cart||!quote||code()!==(quote.code||""))return;
  const current=cart;requestId=requestId||crypto.randomUUID();paying=true;
  for(const id of ["checkoutPay","checkoutApply","checkoutCode","checkoutRemove","checkoutClose"])$(id).disabled=true;
  message("Создаём платёж…");
  try{
   const r=await NiksosApi.buy(current.session.name,current.session.hash,current.plan,current.test,current.provider,
    {promo:quote.code||"",expected_amount:String(quote.amount),request_id:requestId});
   if(r.status==="ok"&&r.pay_url){
    const u=new URL(r.pay_url);if(u.protocol!=="https:")throw new Error("invalid redirect");
    sessionStorage.setItem("niksos_pay_kind",current.plan==="beta"?"beta":"subscription");message("Переходим к оплате…","ok");location.assign(u.href);return;
   }
   if(r.status==="price_changed"){
    paint(r);requestId=null;message("Стоимость изменилась. Проверь новую сумму и нажми «Оплатить» ещё раз.","err");return;
   }
   if(r.status==="payment_pending"){
    message("Заказ ещё обрабатывается. Не создавай второй платёж. Повтори проверку позже или сообщи поддержке номер: "+(r.order_id||"не получен"),"err");$("checkoutPay").textContent="Проверить заказ";return;
   }
   if(String(r.status).startsWith("discount_")){invalidate();message(errors[r.status]||"Промокод больше недоступен.","err");return;}
   message(errors[r.status]||"Не удалось создать платёж.","err");
  }catch{message(errors.net+" Повторное нажатие проверит тот же заказ.","err");}
  finally{
   paying=false;for(const id of ["checkoutApply","checkoutCode","checkoutRemove","checkoutClose"])$(id).disabled=false;
   $("checkoutCode").disabled=current.plan==="beta";$("checkoutPay").disabled=!quote;
  }
 });
})();
