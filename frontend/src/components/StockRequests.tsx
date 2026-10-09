import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../lib/api";
import type { Snapshot } from "../lib/types";

type Review = { planning_7_days?: number; existing_usable_units?: number; quantity?: number; recommended_quantity?: number; reason: string; lines?: Lot[] };
type Lot = { batch_id: string; quantity: number; expires_at: string; lot: string };
type RequestRow = { id: string; donor: string; recipient: string; supply_id: string; requested: number; reason: string; status: string; version: number; offered?: number; lines?: Lot[]; donor_review?: Review; recipient_review?: Review; transfer_id?: string; messages: {actor:string;text:string;at:string}[] };
type Guidance = {title:string;text:string};
export default function StockRequests({ data, actor, onExplain }: { data:Snapshot; actor:string; onExplain:(g:Guidance)=>void }) {
  const cache=useQueryClient();
  const q=useQuery({queryKey:["stock-requests",actor],queryFn:()=>api<RequestRow[]>("/stock-requests",actor),refetchInterval:3000});
  const [donor,setDonor]=useState("");
  const [product,setProduct]=useState(data.supplies[0]?.id || "");
  const [amount,setAmount]=useState("");
  const [reason,setReason]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const own=data.facilities.find(f=>f.id===actor);
  const distance=(f:Snapshot["facilities"][number])=>own ? Math.hypot((f.lat-own.lat)*111,(f.lng-own.lng)*108) : 0;
  const hospitals=data.facilities.filter(f=>f.id!==actor).sort((a,b)=>distance(a)-distance(b));
  const supply=data.supplies.find(s=>s.id===product);
  async function send(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setError("");
    try {
      await post("/stock-requests",actor,{donor,supply_id:product,quantity:Number(amount),reason});
      setReason("");setAmount("");await cache.invalidateQueries({queryKey:["stock-requests"]});
      onExplain({title:"Your request was sent",text:"The supplying hospital can now review your requested quantity and its suggested lots. No inventory has moved."});
    } catch(e){setError(String(e));} finally {setBusy(false);}
  }
  return <div className="stock-requests">
    <section className="trio-card">
      <h2>Request stock from another hospital</h2>
      <p>For needs beyond automatic forecasts. Send a request, review the reply, and make the final decision.</p>
      <form onSubmit={send} className="stock-request-form">
        <label>Nearby hospital<select aria-label="Nearby hospital" required value={donor} onChange={e=>setDonor(e.target.value)}><option value="">Choose a hospital</option>{hospitals.map(f=><option key={f.id} value={f.id}>{f.name} · ~{distance(f).toFixed(1)} km</option>)}</select></label>
        <label>Product<select aria-label="Product" value={product} onChange={e=>setProduct(e.target.value)}>{data.supplies.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Requested quantity<input aria-label="Requested quantity" required type="number" min={supply?.pack_size || 1} step={supply?.pack_size || 1} value={amount} onChange={e=>setAmount(e.target.value)}/><small>{supply?.unit} · whole packs of {supply?.pack_size}</small></label>
        <label className="request-wide">Why do you need this stock?<textarea aria-label="Why do you need this stock?" required minLength={3} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Describe the need that the forecast may not capture"/></label>
        <button className="button" disabled={busy}>Send request</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
    <section className="trio-card"><h2>Inbox and sent requests</h2>
      {q.isLoading && <p>Loading requests…</p>}
      {q.error && <p role="alert">{String(q.error)}</p>}
      {q.data?.length===0 && <p>No requests yet. Incoming requests and hospital replies appear here.</p>}
      {[...(q.data || [])].reverse().map(r=><RequestCard key={r.id} row={r} data={data} actor={actor} onExplain={onExplain}/>)}
    </section>
  </div>;
}
function RequestCard({row:r,data,actor,onExplain}:{row:RequestRow;data:Snapshot;actor:string;onExplain:(g:Guidance)=>void}) {
  const cache=useQueryClient();
  const [quantity,setQuantity]=useState("");
  const [message,setMessage]=useState("");
  const [override,setOverride]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const supplier=actor===r.donor;
  const open=["Requested","Offered"].includes(r.status);
  const name=(id:string)=>data.facilities.find(f=>f.id===id)?.name || id;
  const s=data.supplies.find(s=>s.id===r.supply_id);
  const review=supplier?r.donor_review:r.recipient_review;
  async function respond(action:string) {
    setBusy(true);setError("");
    try {
      await post("/stock-requests/"+r.id+"/respond",actor,{action,version:r.version,quantity:Number(quantity),message,override_reason:override});
      await cache.invalidateQueries();
      onExplain({title:action==="accept"?"Transfer agreed":"Request updated",text:action==="accept"?"Both hospitals have agreed to this offer. Stock is reserved; follow the transfer in Approvals.":"Your response is visible to the other hospital. Inventory remains unchanged until the requester accepts an offer."});
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  return <article className="request-card">
    <div className="request-heading"><h3>{name(r.recipient)} → {name(r.donor)}</h3><strong>{r.status}</strong></div>
    <p><strong>{r.requested} {s?.unit} · {s?.name || r.supply_id}</strong></p>
    <p>{r.reason}</p>
    {review && <div className="request-review">
      <small>Forecast assistant · recommendation, human decision</small>
      <h4>{supplier?"Safe quantity available to offer":"Suggested quantity to accept"}: {supplier?review.quantity:review.recommended_quantity} {s?.unit}</h4>
      {!supplier && review.planning_7_days != null && <p>Your usable stock: <strong>{review.existing_usable_units} {s?.unit}</strong>. Forecast use over the next 7 days: <strong>{review.planning_7_days} {s?.unit}</strong>.</p>}
      <p>{review.reason}</p>
      {!supplier && (review.recommended_quantity ?? 0) < (r.offered || 0) && <p>The forecast does not support using the full offer within the evaluated period. Decline with a reply asking for a smaller offer and send a new request, or document an exceptional need before accepting.</p>}
      <button type="button" onClick={()=>onExplain({title:supplier?"Review before offering stock":"Review before accepting stock",text:review.reason+" Suggested quantity: "+(supplier?review.quantity:review.recommended_quantity)+" "+s?.unit})}>Explain with Pip</button>
      {supplier && open && <button type="button" onClick={()=>setQuantity(String(review.quantity || 0))}>Use suggested quantity</button>}
    </div>}
    {(r.lines || (supplier?r.donor_review?.lines:[]) || []).map(l=><div className="request-lot" key={l.batch_id}><strong>{l.lot}</strong><span>{l.quantity} {s?.unit}</span><span>Expires {new Date(l.expires_at).toLocaleDateString()}</span></div>)}
    {r.offered != null && <p>Supplier’s offer: <strong>{r.offered} {s?.unit}</strong>. Offering confirms supplier agreement; stock is reserved only after acceptance and fresh safety checks.</p>}
    <details><summary>Conversation</summary>{r.messages.map((m,i)=><p key={i}><strong>{name(m.actor)}</strong>: {m.text}</p>)}</details>
    {open && <div className="request-actions">
      <label>Reply message<textarea aria-label="Reply message" maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)}/></label>
      {supplier ? <>
        <label>Quantity to offer<input aria-label="Quantity to offer" type="number" min={s?.pack_size || 1} max={r.requested} step={s?.pack_size || 1} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        <button className="button" disabled={busy || !Number(quantity)} onClick={()=>respond("offer")}>Agree and send offer</button>
      </> : r.status==="Offered" ? <>
        {(r.recipient_review?.recommended_quantity ?? 0)<(r.offered || 0) && <label>Reason for accepting more than forecast recommends<textarea aria-label="Reason for accepting more than forecast recommends" value={override} minLength={10} maxLength={2000} onChange={e=>setOverride(e.target.value)} placeholder="Explain the exceptional need before accepting"/></label>}
        <button className="button" disabled={busy} onClick={()=>respond("accept")}>Accept offer and reserve stock</button>
      </> : <p>Waiting for the supplying hospital’s reply.</p>}
      <button disabled={busy} onClick={()=>respond(supplier?"decline":r.status==="Offered"?"decline":"cancel")}>{supplier || r.status==="Offered"?"Decline":"Cancel request"}</button>
    </div>}
    {r.transfer_id && <p>Transfer {r.transfer_id} · track delivery in Approvals.</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </article>;
}
