/** PDF templates measured from the real invoice/act №256 source PDFs. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { formatMoney } from "../../shared/billing-format";
import type { DocumentSetData } from "./billingDocumentData";
import { fitSize, type DocumentOverlays, type OverlayPlacement } from "./documentImages";

function fontsDirectory(): string {
  const bundleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(bundleDir,"assets","fonts"),path.join(bundleDir,"..","..","assets","fonts"),path.join(bundleDir,"..","assets","fonts")];
  const found = candidates.find(fs.existsSync);
  if (!found) throw new Error(`Не найден каталог шрифтов для PDF. Проверены: ${candidates.join(", ")}`);
  return found;
}
const FONT_DIR=fontsDirectory();
const FONT_REGULAR=path.join(FONT_DIR,"LiberationSerif-Regular.ttf");
const FONT_BOLD=path.join(FONT_DIR,"LiberationSerif-Bold.ttf");
if(process.env.PDF_FONTS_PROBE==="1"){
  console.log(JSON.stringify({probe:"pdf-fonts",moduleUrl:import.meta.url,fontDir:FONT_DIR,regular:FONT_REGULAR,bold:FONT_BOLD,regularExists:fs.existsSync(FONT_REGULAR),boldExists:fs.existsSync(FONT_BOLD)}));
  process.exit(0);
}
export function pdfFontFiles(){return {regular:FONT_REGULAR,bold:FONT_BOLD};}

interface Doc {
  font(n:string):Doc;fontSize(n:number):Doc;text(t:string,x?:number,y?:number,o?:Record<string,unknown>):Doc;
  moveTo(x:number,y:number):Doc;lineTo(x:number,y:number):Doc;stroke(c?:string):Doc;lineWidth(n:number):Doc;
  rect(x:number,y:number,w:number,h:number):Doc;save():Doc;restore():Doc;opacity(n:number):Doc;
  image(src:string|Buffer,x?:number,y?:number,o?:Record<string,unknown>):Doc;openImage(src:string|Buffer):{width:number;height:number};
  widthOfString(t:string):number;end():void;[key:string]:unknown;
}
const PAGE_W=595.28, PAGE_H=841.89;
const L=28.8, R=566.4, W=R-L;
const FS=8.25, SMALL=6.7, TITLE=12.2;

function createDoc():Doc{
  for(const f of [FONT_REGULAR,FONT_BOLD]) if(!fs.existsSync(f)) throw new Error(`Не найден шрифт для PDF: ${f}`);
  const d=new PDFDocument({size:"A4",margins:{top:0,bottom:0,left:0,right:0},autoFirstPage:true}) as unknown as Doc;
  (d as unknown as {registerFont(n:string,s:string):void}).registerFont("Regular",FONT_REGULAR);
  (d as unknown as {registerFont(n:string,s:string):void}).registerFont("Bold",FONT_BOLD);
  return d;
}
function collect(d:Doc):Promise<Buffer>{return new Promise((resolve,reject)=>{const chunks:Buffer[]=[];const s=d as unknown as {on(e:string,c:(...a:any[])=>void):void};s.on("data",(c:Buffer)=>chunks.push(c));s.on("end",()=>resolve(Buffer.concat(chunks)));s.on("error",reject);d.end();});}
function line(d:Doc,x1:number,y1:number,x2:number,y2:number,w=.55){d.save().lineWidth(w).stroke("#000").moveTo(x1,y1).lineTo(x2,y2).stroke().restore();}
function box(d:Doc,x:number,y:number,w:number,h:number,lw=.55){d.save().lineWidth(lw).stroke("#000").rect(x,y,w,h).stroke().restore();}
function txt(d:Doc,t:string,x:number,y:number,w:number,opts:{bold?:boolean;size?:number;align?:"left"|"center"|"right";wrap?:boolean}={}){
  d.font(opts.bold?"Bold":"Regular").fontSize(opts.size??FS).text(t,x,y,{width:w,align:opts.align??"left",lineBreak:opts.wrap??false});
}
function partyText(d:Doc,label:string,value:string,y:number){
  txt(d,label,196,y,58,{bold:false,size:8.1});
  txt(d,value,261.8,y,296.5,{bold:true,size:8.1,wrap:true});
}
function sellerParty(data:DocumentSetData):string{
  const ids=[data.seller.inn?`ИНН ${data.seller.inn}`:"",data.seller.kpp?`КПП ${data.seller.kpp}`:"",data.seller.ogrn?`ОГРН(ИП) ${data.seller.ogrn}`:""].filter(Boolean).join(", ");
  return [data.seller.name,ids,data.seller.address,data.seller.phone?`Тел.: ${data.seller.phone}.`:""].filter(Boolean).join(", ");
}
function buyerParty(data:DocumentSetData):string{
  const ids=[data.buyer.inn?`ИНН ${data.buyer.inn}`:"",data.buyer.kpp?`КПП ${data.buyer.kpp}`:"",data.buyer.ogrn?`ОГРН(ИП) ${data.buyer.ogrn}`:""].filter(Boolean).join(", ");
  return [data.buyer.name,ids,data.buyer.address].filter(Boolean).join(", ");
}

function drawInvoiceBank(d:Doc,data:DocumentSetData){
  const x0=28.8,x1=285.4,x2=297.3,x3=355.2,x4=566.4;
  const y0=123.2,y1=138.4,y2=161.7,y3=176.6,y4=225.6;
  box(d,x0,y0,x4-x0,y4-y0);
  line(d,x2,y0,x2,y4); line(d,x3,y0,x3,y4);
  line(d,x2,y1,x4,y1); line(d,x0,y2,x4,y2); line(d,x0,y3,x2,y3);
  line(d,x1,y2,x1,y3); line(d,x2,y3,x2,y4);
  txt(d,data.seller.bankName||"",31.2,125.2,250,{size:8.2});
  txt(d,"БИК",299.4,125.2,52,{size:8.2}); txt(d,data.seller.bankBik||"",357.5,125.2,205,{size:8.2});
  txt(d,"Сч. №",299.4,140.0,52,{size:8.2}); txt(d,data.seller.bankCorrespondentAccount||"",357.5,140.0,205,{size:8.2});
  txt(d,"Банк получателя",31.2,150.0,120,{size:6.8});
  txt(d,data.seller.inn?`ИНН ${data.seller.inn}`:"",31.2,163.4,245,{size:8.2});
  txt(d,"Сч. №",299.4,163.4,52,{size:8.2}); txt(d,data.seller.bankAccount||"",357.5,163.4,205,{size:8.2});
  txt(d,data.seller.name,31.2,178.2,250,{size:8.2,wrap:true});
  txt(d,"Получатель",31.2,214.4,100,{size:6.8});
}

const CX=[28.8,54.2,312.2,344.5,407.2,486.7,566.4];
function drawTable(d:Doc,data:DocumentSetData,top:number){
  const headerBottom=top+15.2,rowBottom=top+30.2;
  box(d,L,top,W,rowBottom-top);
  line(d,L,headerBottom,R,headerBottom);
  for(let i=1;i<CX.length-1;i++) line(d,CX[i],top,CX[i],rowBottom);
  const headers=["№","Наименование","Ед.","Кол-во","Цена р.","Сумма р."];
  headers.forEach((h,i)=>txt(d,h,CX[i]+2.5,top+2.2,CX[i+1]-CX[i]-5,{bold:true,size:7.5,align:i===1?"center":i>=2?"center":"left"}));
  const rows=data.lines.length?data.lines:[{position:1,name:data.serviceName,unit:"шт",quantity:1,price:data.totalAmount,amount:data.totalAmount}];
  const r=rows[0];
  const vals=[String(r.position),r.name,r.unit,String(r.quantity).replace(".",","),formatMoney(r.price),formatMoney(r.amount)];
  vals.forEach((v,i)=>txt(d,v,CX[i]+2.5,headerBottom+2.2,CX[i+1]-CX[i]-5,{size:7.6,align:i>=3?"right":"left"}));
  return rowBottom;
}
function drawTotals(d:Doc,data:DocumentSetData,top:number,act:boolean){
  const valueX=486.7,rowH=15.0;
  const rows:[[string,string,boolean],[string,string,boolean],[string,string,boolean]]=[
    ["Итого:",formatMoney(data.totalAmount),false],
    ["Ставка НДС:",data.vat.rateText,false],
    [act?"Всего :":"Всего к оплате:",formatMoney(data.totalAmount),true],
  ];
  rows.forEach(([label,value,bold],i)=>{
    const y=top+i*rowH;
    box(d,valueX,y,R-valueX,rowH);
    txt(d,label,407,y+2.1,valueX-410,{bold,size:7.8,align:"right"});
    txt(d,value,valueX+2.5,y+2.1,R-valueX-5,{bold,size:7.8,align:"right"});
  });
  return top+rowH*3;
}
function drawSummary(d:Doc,data:DocumentSetData,y:number){
  txt(d,`Всего наименований ${data.lines.length}, на сумму ${data.totalAmountText}`,L,y,300,{size:7.7});
  txt(d,data.amountInWords,L,y+10.7,360,{bold:true,size:7.7});
}
function overlay(d:Doc,images:DocumentOverlays|undefined){
  if(!images)return;
  const draw=(bytes:Buffer|null,p:OverlayPlacement|null)=>{if(!bytes||!p)return;try{const im=d.openImage(bytes);const f=fitSize(im.width,im.height,p.width,p.height);const x=p.x+(p.width-f.width)/2;const top=PAGE_H-p.y-p.height;const y=top+(p.height-f.height)/2;d.save().opacity(1).image(bytes,x,y,{width:f.width,height:f.height}).restore();}catch{}};
  draw(images.signatureBytes,images.signature);draw(images.stampBytes,images.stamp);
}

export async function renderInvoicePdf(data:DocumentSetData,images?:DocumentOverlays):Promise<Buffer>{
  const d=createDoc();
  partyText(d,"Получатель:",sellerParty(data),28.5);
  partyText(d,"Плательщик:",buyerParty(data),83.5);
  drawInvoiceBank(d,data);
  txt(d,`Счет №${data.number} от ${data.documentDateText} г.`,L,243.5,300,{bold:true,size:TITLE});
  const bottom=drawTable(d,data,264.1); drawTotals(d,data,bottom,false);
  drawSummary(d,data,351.0); line(d,L,379.7,R,379.7,1.15);
  txt(d,"Директор",118.4,421.8,95,{bold:true,size:8.0});
  line(d,219.9,433.5,476.8,433.5,.5); txt(d,data.seller.directorName||data.seller.name,405,421.8,72,{size:8.0,align:"right"});
  txt(d,"Главный бухгалтер",118.4,445.0,100,{bold:true,size:8.0});
  line(d,219.9,456.8,476.8,456.8,.5); txt(d,data.seller.accountantName||data.seller.directorName||"",405,445.0,72,{size:8.0,align:"right"});
  overlay(d,images); return collect(d);
}

export async function renderActPdf(data:DocumentSetData,images?:DocumentOverlays):Promise<Buffer>{
  const d=createDoc();
  partyText(d,"Исполнитель:",sellerParty(data),39.3);
  partyText(d,"Заказчик:",buyerParty(data),94.2);
  txt(d,`Акт №${data.number} от ${data.documentDateText} г.`,L,133.6,300,{bold:true,size:TITLE});
  const bottom=drawTable(d,data,154.2); drawTotals(d,data,bottom,true);
  drawSummary(d,data,251.8);
  txt(d,"Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объему, качеству, срокам оказания услуг не имеет.",L,304.3,W,{size:7.7,wrap:true});
  line(d,L,336.7,R,336.7,1.15);
  txt(d,"Исполнитель",30.6,389.5,75,{size:8.0});
  line(d,90.3,408.4,297.0,408.4,.5); txt(d,data.seller.directorName||data.seller.name,220,389.5,77,{size:8.0,align:"right"});
  txt(d,"Заказчик",315,389.5,55,{size:8.0});
  line(d,359.1,408.4,564.6,408.4,.5); txt(d,data.buyer.signatoryName||data.buyer.name,410,389.5,154,{size:8.0,align:"right"});
  txt(d,"подпись",150,411.0,80,{size:SMALL,align:"center"}); txt(d,"подпись",420,411.0,80,{size:SMALL,align:"center"});
  overlay(d,images); return collect(d);
}
