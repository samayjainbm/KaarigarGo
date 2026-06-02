'use client';

import { Avatar, Badge, Button, Card, Skeleton, StatusBadge } from '@/components/ui';
import { Api } from '@/lib/api';
import { dateTime, rupees, titleCase } from '@/lib/format';
import { connectSocket } from '@/lib/socket';
import { CheckCircle2, MapPin, Navigation, ShieldAlert, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const TERMINAL = ['SETTLED', 'REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_WORKER', 'EXPIRED'];
const PAYABLE = ['ACCEPTED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED'];

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<any>(null);
  const [paying, setPaying] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await Api.booking(id);
      setB(r.data);
    } catch {
      /* ignore transient */
    }
  }, [id]);

  // Realtime: live booking updates via Socket.IO (with a slow poll as fallback).
  useEffect(() => {
    load();
    const socket = connectSocket();
    socket.on('connect', () => {
      setLive(true);
      socket.emit('booking.join', { bookingId: id });
    });
    socket.on('disconnect', () => setLive(false));
    const refresh = () => load();
    socket.on('booking.status_changed', refresh);
    socket.on('payment.updated', refresh);
    socket.on('booking.location_update', refresh);
    socket.on('chat.message', refresh);

    const t = setInterval(load, 12000);
    return () => {
      clearInterval(t);
      socket.disconnect();
    };
  }, [id, load]);

  if (!b) return <Skeleton className="mx-auto h-96 max-w-3xl" />;

  const paid = (b.payments ?? []).some((p: any) => p.status === 'PAID');
  const canPay = b.paymentMode === 'ONLINE' && PAYABLE.includes(b.status) && !paid;
  const canReview = ['COMPLETED', 'SETTLED'].includes(b.status);

  async function pay() {
    setPaying(true);
    setMsg(null);
    try {
      const order = await Api.paymentOrder(id);
      if (order.data.provider === 'mock') {
        await Api.mockPay(order.data.orderId);
        setMsg('Payment successful (dev mock).');
      } else {
        setMsg('Order created — complete checkout in your Razorpay app.');
      }
      await load();
    } catch (e: any) {
      setMsg(e.message ?? 'Payment failed');
    } finally {
      setPaying(false);
    }
  }

  async function submitReview() {
    setReviewMsg(null);
    try {
      await Api.review(id, { rating, comment: comment || undefined });
      setReviewMsg('Thanks for your review! ⭐');
    } catch (e: any) {
      setReviewMsg(e.message ?? 'Could not submit review');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/app/bookings" className="text-sm text-slate-500 hover:text-slate-800">← All bookings</Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{b.service?.name}</h1>
          <p className="mt-1 text-sm text-slate-400">Booked {dateTime(b.createdAt)} · #{b.id.slice(0, 8)}</p>
        </div>
        <div className="flex items-center gap-2">
          {live && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          )}
          <StatusBadge status={b.status} />
        </div>
      </div>

      {/* En route banner */}
      {b.status === 'EN_ROUTE' && (
        <div className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-800">
          <Navigation className="h-5 w-5 animate-pulse" />
          <p className="text-sm font-medium">Your pro is on the way. Track their arrival live.</p>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-[1fr_280px]">
        {/* Worker + timeline */}
        <div className="space-y-6">
          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Your pro</h3>
            {b.worker ? (
              <div className="flex items-center gap-3">
                <Avatar name={b.worker.user?.name} size={48} />
                <div>
                  <p className="font-semibold text-slate-900">{b.worker.user?.name}</p>
                  <p className="text-sm text-slate-500">★ {b.worker.ratingAvg?.toFixed?.(1) ?? b.worker.ratingAvg} · verified pro</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Finding the best nearby pro for you…</p>
            )}
          </Card>

          <Card>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Timeline</h3>
            <ol className="space-y-4">
              {(b.events ?? []).map((e: any, i: number) => (
                <li key={e.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full ${i === b.events.length - 1 ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    {i < b.events.length - 1 && <span className="my-1 w-px flex-1 bg-slate-200" />}
                  </div>
                  <div className="pb-1">
                    <p className="text-sm font-semibold text-slate-800">{titleCase(e.type)}</p>
                    <p className="text-xs text-slate-400">{dateTime(e.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {/* Review */}
          {canReview && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Rate your experience</h3>
              {reviewMsg ? (
                <p className="text-sm font-medium text-emerald-600">{reviewMsg}</p>
              ) : (
                <>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => setRating(n)}>
                        <Star className={`h-7 w-7 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Tell us how it went (optional)"
                    className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-brand-400"
                    rows={3}
                  />
                  <Button className="mt-3" onClick={submitReview}>Submit review</Button>
                </>
              )}
            </Card>
          )}
        </div>

        {/* Payment / summary */}
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Payment</h3>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-sm text-slate-500">{b.status === 'SETTLED' ? 'Paid' : 'Amount'}</span>
              <span className="text-2xl font-bold text-slate-900">{rupees(b.finalPrice ?? b.priceEstimate)}</span>
            </div>
            <div className="mt-2">
              {paid ? (
                <Badge tone="green">Paid · {b.paymentMode === 'CASH' ? 'cash' : 'online'}</Badge>
              ) : (
                <Badge tone="amber">{b.paymentMode === 'CASH' ? 'Pay cash after service' : 'Payment pending'}</Badge>
              )}
            </div>
            {canPay && (
              <Button className="mt-4 w-full" loading={paying} onClick={pay}>Pay {rupees(b.finalPrice ?? b.priceEstimate)}</Button>
            )}
            {msg && <p className="mt-3 text-sm text-slate-600">{msg}</p>}
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <MapPin className="h-4 w-4 text-brand-500" />
              {b.location ? `${b.location.lat}, ${b.location.lng}` : 'Location set'}
            </div>
          </Card>

          {['ACCEPTED', 'EN_ROUTE', 'IN_PROGRESS'].includes(b.status) && (
            <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100">
              <ShieldAlert className="h-4 w-4" /> SOS / Safety
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
