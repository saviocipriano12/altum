import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageDeliveryStatus } from "../app/cliente/painel/inbox/message-delivery-status.tsx";

const render=(channel:string,status?:string,latest=true)=>renderToStaticMarkup(React.createElement(MessageDeliveryStatus,{channel,status,latest}));
test("Instagram history without delivery receipts never invents a pending clock",()=>{
 for(const status of[undefined,"","sent","delivered"])assert.equal(render("instagram",status),"");
});
test("social channel delivery failures and actual sending remain visible as text",()=>{
 for(const channel of["instagram","messenger"]){
  assert.match(render(channel,"failed"),/Não enviada/);assert.match(render(channel,"confirmation_pending"),/Confirmação pendente/);
  assert.match(render(channel,"queued"),/Enviando/);assert.doesNotMatch(render(channel,"queued"),/<svg/);
 }
});
test("Instagram shows Visto only for a confirmed read receipt on the latest outgoing message",()=>{
 assert.match(render("instagram","read",true),/Visto/);assert.equal(render("instagram","read",false),"");assert.equal(render("instagram","sent",true),"");
});
test("WhatsApp keeps its pending, sent, delivered, read and failure indicators",()=>{
 for(const[status,label]of[[undefined,"Aguardando envio"],["sent","Enviada"],["delivered","Entregue"],["read","Lida"],["failed","Falha no envio"]])assert.match(render("whatsapp",status),new RegExp(`aria-label="${label}"`));
});
