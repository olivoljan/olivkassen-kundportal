"use client";

import { useEffect, useRef, useState } from "react";
import { PauseCircle } from "lucide-react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabaseClient";
import { PortalHeader } from "../components/portal/PortalHeader";
import { AccordionCard } from "../components/portal/AccordionCard";
import { PRICE_MAP, Volume, Interval } from "@/lib/stripePriceMap";

type Subscription = {
  status: string;
  cancel_at_period_end?: boolean;
  price_id?: string;
};

const normalizeSubscription = (sub: Subscription | null) => {
  if (!sub) return sub;

  if (sub.cancel_at_period_end) {
    return { ...sub, status: "canceling" };
  }

  return sub;
};

export default function AccountClient() {
  const supabase = createClient();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  const [selectedVolume, setSelectedVolume] = useState<Volume>("3L");
  const [selectedInterval, setSelectedInterval] = useState<Interval>("1m");

  const [activeVolume, setActiveVolume] = useState<Volume>("3L");
  const [activeInterval, setActiveInterval] = useState<Interval>("1m");

  const [nextDelivery, setNextDelivery] = useState<number | null>(null);

  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  const [pauseType, setPauseType] = useState<"skip_one" | "indefinite">("skip_one");
  const [showPauseSelector, setShowPauseSelector] = useState(false);

  const [extraVolume, setExtraVolume] = useState<"1L" | "2L" | "3L">("3L");
  const [extraPrices, setExtraPrices] = useState<Record<string, { amount: number; priceId: string }> | null>(null);
  const [extraPricesLoading, setExtraPricesLoading] = useState(false);
  const [extraOrderSuccess, setExtraOrderSuccess] = useState(false);
  const [extraOrderLoading, setExtraOrderLoading] = useState(false);

  const hasSchedule = !!(subscription as any)?.schedule;
  const hasPlanChanged = selectedVolume !== activeVolume || selectedInterval !== activeInterval;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("order") === "success") {
      setExtraOrderSuccess(true);
      setOpenSection("extraOrder");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (hasSchedule) setPauseType("indefinite");
  }, [hasSchedule]);

  const [confirmType, setConfirmType] = useState<
    | "pause"
    | "unpause"
    | "cancel"
    | "uncancel"
    | "changePlan"
    | "pauseIndefiniteFromCancel"
    | null
  >(null);
  const [portalLoading, setPortalLoading] = useState<"payment" | "address" | null>(null);
  const [customerAddress, setCustomerAddress] = useState<any>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const showToast = (message: string, duration = 5000) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), duration);
  };

  const toggleSection = (section: string) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  const safeFetch = async (url: string, body: any) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;
    return res.json();
  };

  /* ================= LOAD ================= */

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      setSession(session);

      // 🔒 Always sync Stripe customer before loading data
      await safeFetch("/api/stripe/sync-customer", {
        userId: session.user.id,
      });

      /* ================= LOAD SUBSCRIPTION + INVOICES ================= */

      const [sub, invRes] = await Promise.all([
        safeFetch("/api/stripe/subscription", { userId: session.user.id }),
        safeFetch("/api/stripe/invoices", { userId: session.user.id }),
      ]);


      if (sub?.cancel_at_period_end) {
        sub.status = "canceling";
      }

      setSubscription(sub);

      if (sub?.volume) {
        setSelectedVolume(sub.volume as Volume);
        setActiveVolume(sub.volume as Volume);
      }

      if (sub?.interval_count === 1) { setSelectedInterval("1m"); setActiveInterval("1m"); }
      if (sub?.interval_count === 3) { setSelectedInterval("3m"); setActiveInterval("3m"); }
      if (sub?.interval_count === 6) { setSelectedInterval("6m"); setActiveInterval("6m"); }

      if (sub?.current_period_end) setNextDelivery(sub.current_period_end);
      if (sub?.address) setCustomerAddress(sub.address);

      if (invRes?.invoices) {
        setInvoices(
          invRes.invoices.map((inv: any) => ({
            id: inv.id,
            shortId: inv.id.slice(-6).toUpperCase(),
            date: inv.created,
            amount: inv.amount_paid ?? 0,
            receipt_url: inv.receipt_url,
          }))
        );
      }

      setLoading(false);
    };

    load();
  }, []);

  /* ================= ACTIONS ================= */

  const handlePauseResume = async () => {
    if (!session?.user?.id) return;

    const res = await fetch("/api/stripe/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.user.id, pauseType }),
    });

    const updated = await safeFetch("/api/stripe/subscription", {
      userId: session.user.id,
    });

    setSubscription(normalizeSubscription(updated));
  };

  const handleCancel = async (undo = false) => {
    if (!session?.user?.id) return;

    await safeFetch("/api/stripe/cancel", {
      userId: session.user.id,
      undo,
    });

    const updated = await safeFetch("/api/stripe/subscription", {
      userId: session.user.id,
    });

    setSubscription(normalizeSubscription(updated));
  };

  const handleChangePlan = async () => {
    if (!session?.user?.id) return;

    setUpdatingPlan(true);

    const response = await fetch("/api/stripe/change-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: session.user.id,
        volume: selectedVolume,
        interval: selectedInterval,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      setUpdatingPlan(false);
      showToast(data.error ?? "Ett fel uppstod", 9000);
      return;
    }

    const res = await response.json();

    const updated = await safeFetch("/api/stripe/subscription", {
      userId: session.user.id,
    });

    setSubscription(normalizeSubscription(updated));
    setActiveVolume(selectedVolume);
    setActiveInterval(selectedInterval);
    setUpdatingPlan(false);
    showToast("Abonnemanget uppdaterades");
  };

  const handleOpenPortal = async (type: "payment" | "address") => {
    setPortalLoading(type);
    const res = await safeFetch("/api/stripe/portal-session", {
      userId: session.user.id,
    });
    if (res?.url) {
      window.location.href = res.url;
    } else {
      setPortalLoading(null);
      showToast("Något gick fel. Försök igen.", 5000);
    }
  };

  /* ================= EXTRA ORDER — LOAD PRICES ================= */

  const loadExtraPrices = async () => {
    if (extraPrices) return; // already loaded
    setExtraPricesLoading(true);
    try {
      const res = await fetch("/api/stripe/extra-order-prices", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setExtraPrices(data);
      }
    } finally {
      setExtraPricesLoading(false);
    }
  };

  const handleExtraOrder = async () => {
    if (!session?.access_token) return;
    setExtraOrderLoading(true);
    try {
      const res = await fetch("/api/stripe/one-time-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ volume: extraVolume }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast(data.error ?? "Något gick fel", 9000);
        setExtraOrderLoading(false);
      }
    } catch {
      showToast("Något gick fel. Försök igen.", 9000);
      setExtraOrderLoading(false);
    }
  };

  const handleModalConfirm = async () => {
    setActionLoading(true);

    try {
      if (
        confirmType === "pause" ||
        confirmType === "unpause" ||
        confirmType === "pauseIndefiniteFromCancel"
      ) {
        await handlePauseResume();
        setOpenSection(null);
        showToast(
          confirmType === "unpause"
            ? "Abonnemanget är återupptaget"
            : "Abonnemanget är pausat"
        );
      }

      if (confirmType === "cancel") {
        await handleCancel(false);
        setOpenSection(null);
        showToast("Abonnemanget avslutades");
      }

      if (confirmType === "uncancel") {
        await handleCancel(true);
        setOpenSection(null);
        showToast("Avslutet har ångrats");
      }

      if (confirmType === "changePlan") {
        await handleChangePlan();
      }

      setConfirmType(null);
    } catch {
      // Keep modal open so the user can retry
    } finally {
      setActionLoading(false);
    }
  };

  /* ================= HELPERS ================= */

  const formatInterval = (interval: Interval) => {
    if (interval === "1m") return "varje månad";
    if (interval === "3m") return "var 3:e månad";
    return "var 6:e månad";
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const styles: Record<string, string> = {
      active: "bg-gray-100 text-gray-800",
      paused: "bg-yellow-100 text-yellow-800",
      canceling: "bg-amber-100 text-amber-800",
      canceled: "bg-gray-200 text-gray-600",
    };

    const labels: Record<string, string> = {
      active: "✓ Aktivt",
      paused: "Pausad",
      canceling: "Avslutad",
      canceled: "Avslutad",
    };

    return (
      <div
        className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${styles[status]}`}
      >
        {labels[status]}
      </div>
    );
  };

  /* ================= CUSTOM SELECT ================= */

  const CustomSelect = ({
    options,
    value,
    activeValue,
    onChange,
    disabled,
  }: {
    options: { value: string; label: string; disabled?: boolean }[];
    value: string;
    activeValue: string;
    onChange: (value: string) => void;
    disabled?: (value: string) => boolean;
  }) => {
    const [open, setOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const wrapperRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      const handler = (e: PointerEvent) => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener("pointerdown", handler);
      return () => document.removeEventListener("pointerdown", handler);
    }, []);

    const updatePosition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownStyle({
          position: "fixed",
          top: rect.bottom + 8,
          left: rect.left,
          width: rect.width,
          zIndex: 9999,
        });
      }
    };

    useEffect(() => {
      if (open) updatePosition();
    }, [open]);

    useEffect(() => {
      if (!open) return;
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }, [open]);

    const selected = options.find((o) => o.value === value);
    const isActiveTrigger = value === activeValue;

    const dropdownList = open && createPortal(
      <div
        style={dropdownStyle}
        className="bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {options.map((opt) => {
          const isDisabled = disabled?.(opt.value) ?? false;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={isDisabled}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                if (!isDisabled) {
                  onChange(opt.value);
                  setOpen(false);
                }
              }}
              className={`w-full flex items-center justify-between px-6 py-4 text-base text-left transition ${
                isDisabled
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:bg-gray-50 cursor-pointer"
              } ${value === opt.value ? "font-semibold" : ""}`}
            >
              <span>{opt.label}</span>
              {opt.value === activeValue && (
                <span className="ml-3 inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                  Aktivt
                </span>
              )}
            </button>
          );
        })}
      </div>,
      document.body
    );

    return (
      <div ref={wrapperRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between border border-gray-200 rounded-full px-6 py-4 bg-white text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition"
        >
          <span>{selected?.label}</span>
          <div className="flex items-center gap-2 shrink-0">
            {isActiveTrigger && (
              <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                Aktivt
              </span>
            )}
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </button>

        {dropdownList}
      </div>
    );
  };

  /* ================= RENDER ================= */

  return (
    <main className="min-h-screen flex justify-center px-4 py-10 bg-[#ECE6DF]">
      <div className="w-full max-w-[400px] space-y-4">

        <PortalHeader user={session?.user} />

        {/* ================= EXTRA BESTÄLLNING ================= */}

        <AccordionCard
          title={
            <div>
              <div className="text-black font-extrabold">Extra beställning</div>
              {openSection !== "extraOrder" && (
                <div className="text-black text-lg font-normal mt-1.5">
                  Beställ mer olivolja utan att ändra ditt abonnemang.
                </div>
              )}
            </div>
          }
          cardClassName={
            openSection === "extraOrder"
              ? "bg-white text-black"
              : "bg-[#a7f57b] text-black"
          }
          chevronClassName="text-black"
          isOpen={openSection === "extraOrder"}
          onToggle={() => {
            toggleSection("extraOrder");
            if (openSection !== "extraOrder") loadExtraPrices();
          }}
        >
          {extraOrderSuccess ? (
            /* ── SUCCESS STATE ── */
            <div className="space-y-4 py-2">
              <h3 className="text-xl font-bold text-black">
                Tack för din beställning!
              </h3>
              <p className="text-lg text-gray-700 leading-relaxed">
                Din olivolja är på väg och kommer att Levereras med DHL/Schenker till ditt närmsta ombud inom 2–4 dagar
              </p>
              <button
                onClick={() => {
                  setExtraOrderSuccess(false);
                  setOpenSection(null);
                }}
                className="w-full bg-[#1a3300] text-[#ffe95c] rounded-full py-4 px-6 font-semibold text-base hover:opacity-90 transition"
              >
                Stäng
              </button>
            </div>
          ) : (
            /* ── ORDER STATE ── */
            <div className="space-y-6">
              <p className="text-lg text-gray-700 leading-relaxed">
                Har du slut på olivolja? Beställ extra direkt här — din adress är redan sparad och du betalar som vanligt. Abonnemanget påverkas inte.
              </p>

              {/* ── VOLUME PICKER ── */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-black">
                  Välj storlek
                </h3>

                <div className="grid grid-cols-3 gap-2">
                  {(["1L", "2L", "3L"] as const).map((vol) => (
                    <button
                      key={vol}
                      type="button"
                      onClick={() => setExtraVolume(vol)}
                      className={`relative flex flex-col items-center justify-center rounded-lg border-2 px-2 py-4 text-center transition font-semibold text-sm
                ${extraVolume === vol
                  ? "border-black bg-[#B0ED8D] text-black"
                  : "border-gray-200 bg-white text-black hover:border-gray-400"
                }`}
                    >
                      {vol === "3L" && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#ffe95c] text-black text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                          MEST POPULÄR
                        </span>
                      )}
                      <span className="text-base font-medium">
                        {vol === "1L" ? "1 liter" : vol === "2L" ? "2 liter" : "3 liter"}
                      </span>
                      <span className="text-sm font-normal mt-0.5">
                        {vol === "1L" ? "1x1L" : vol === "2L" ? "2x1L" : "3x1L"}
                      </span>
                    </button>
                  ))}
                </div>

                {/* ── PRICE DISPLAY ── */}
                <div className="bg-[#f5f4f4] rounded-xl px-4 py-3 min-h-[52px] flex items-center">
                  {extraPricesLoading ? (
                    <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                  ) : extraPrices ? (
                    <div className="space-y-0.5">
                      <p className="text-base font-semibold text-black">
                        {extraVolume === "1L"
                          ? "1 liter olivolja — 249 kr + 59 kr frakt"
                          : extraVolume === "2L"
                          ? "2 liter olivolja — 448 kr + 59 kr frakt"
                          : "3 liter olivolja — 598 kr + 59 kr frakt"}
                      </p>
                      <p className="text-sm text-gray-500">
                        Totalt:{" "}
                        <span className="font-semibold text-black">
                          {extraPrices[extraVolume]
                            ? `${(extraPrices[extraVolume].amount / 100).toFixed(0)} kr`
                            : "—"}
                        </span>{" "}
                        · Levereras med DHL/Schenker till ditt närmsta ombud inom 2–4 dagar
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Kunde inte hämta pris</p>
                  )}
                </div>
              </div>

              {/* ── ORDER BUTTON ── */}
              <button
                onClick={handleExtraOrder}
                disabled={extraOrderLoading || extraPricesLoading || !extraPrices}
                className="w-full bg-[#1a3300] text-[#ffe95c] rounded-full py-4 px-6 font-semibold text-base hover:opacity-90 transition disabled:opacity-50"
              >
                {extraOrderLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#ffe95c] border-t-transparent rounded-full animate-spin" />
                    Skickar till betalning...
                  </span>
                ) : (
                  "Beställ extra olivolja"
                )}
              </button>
            </div>
          )}
        </AccordionCard>

        {/* ================= ABONNEMANG ================= */}

        <AccordionCard
          title="Hantera abonnemang"
          isOpen={openSection === "subscription"}
          onToggle={() => toggleSection("subscription")}
        >
          {loading && (
            <p className="text-sm text-muted-foreground">
              Laddar abonnemang...
            </p>
          )}

          {!loading &&
            subscription &&
            subscription.status !== "canceled" && (
              <div className="space-y-8">

                {/* ================= ACTIVE PLAN SUMMARY ================= */}
                {subscription?.status === "canceling" ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Abonnemanget är avslutat
                    </p>
                    <button
                      onClick={() => setConfirmType("uncancel")}
                      className="underline text-black text-md"
                    >
                      Ångra avslut
                    </button>
                  </div>
                ) : subscription?.status === "paused" ? (
                  <div className="space-y-2">
                    <p className="mt-1 text-md text-muted-foreground flex items-center gap-1">
                      <span>Abonnemanget är pausat</span>
                      <PauseCircle className="w-4 h-4 shrink-0" />
                    </p>
                    <button
                      onClick={() => setConfirmType("unpause")}
                      className="underline text-black text-md"
                    >
                      Återuppta abonnemang
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold">
                      Ändra abonnemang
                      </h3>
                      <div className="bg-[#f5f4f4] rounded-xl px-4 py-3 space-y-1">
                        <p className="text-md text-muted-foreground">
                          Abonnemang:{" "}
                          <span className="font-medium text-foreground">
                            {activeVolume} / {formatInterval(activeInterval)}
                          </span>
                        </p>
                        {nextDelivery && (
                          <p className="text-md text-muted-foreground">
                            Nästa leverans:{" "}
                            <span className="font-medium text-foreground">
                              {new Date(nextDelivery * 1000).toLocaleDateString("sv-SE", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* ================= VOLUME FIRST ================= */}
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold">
                          Hur mycket ska vi leverera?
                        </h3>

                        <CustomSelect
                          options={[
                            { value: "2L", label: "2 liter" },
                            { value: "3L", label: "3 liter (3 × 1L)" },
                          ]}
                          value={selectedVolume}
                          activeValue={activeVolume}
                          onChange={(v) => setSelectedVolume(v as Volume)}
                        />
                      </div>

                      {/* ================= INTERVAL SECOND ================= */}
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold">
                          Hur ofta ska vi leverera?
                        </h3>

                        <CustomSelect
                          options={[
                            { value: "1m", label: "Varje månad" },
                            { value: "3m", label: "Var 3:e månad" },
                            { value: "6m", label: "Var 6:e månad" },
                          ]}
                          value={selectedInterval}
                          activeValue={activeInterval}
                          onChange={(v) => setSelectedInterval(v as Interval)}
                        />
                      </div>

                      {/* ================= ACTION BUTTONS ================= */}
                      {hasPlanChanged && (
                        <div className="flex items-center justify-between gap-6 pt-2">
                          <button
                            onClick={() => setConfirmType("changePlan")}
                            disabled={updatingPlan}
                            className="flex-1 bg-[#1a3300] text-[#ffe95c] rounded-full py-4 px-6 font-semibold disabled:opacity-50 transition hover:opacity-90"
                          >
                            {updatingPlan ? "Uppdaterar..." : "Spara ändringar"}
                          </button>

                          <button
                            onClick={() => {
                              setSelectedVolume(activeVolume);
                              setSelectedInterval(activeInterval);
                            }}
                            className="underline text-gray-600 whitespace-nowrap text-base"
                          >
                            Avbryt
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}

              </div>
            )}

          {!loading && subscription?.status === "canceled" && (
            <p className="text-sm text-gray-500">
              Detta abonnemang är avslutat.
            </p>
          )}
        </AccordionCard>

        <AccordionCard
          title="Pausa eller avsluta"
          isOpen={openSection === "manage"}
          onToggle={() => toggleSection("manage")}
        >
          <div className="space-y-10">
            {/* ================= PAUSE ================= */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Pausa abonnemang</h3>
              <p className="text-gray-600 leading-relaxed">
                Har du fortfarande olivolja kvar? Pausa ditt abonnemang och
                bestäm själv när du vill få nästa leverans. Du kan när som
                helst starta leveranserna igen när du behöver mer.
              </p>
              <button
                disabled={
                  subscription?.status === "canceled" ||
                  subscription?.status === "canceling"
                }
                onClick={() => {
                  if (subscription?.status === "paused") {
                    setConfirmType("unpause");
                  } else {
                    setShowPauseSelector(true);
                  }
                }}
                className={`px-6 py-4 rounded-full font-semibold transition ${
                  subscription?.status === "canceled" || subscription?.status === "canceling"
                    ? "bg-[#1a3300] text-[#ffe95c] opacity-40 cursor-not-allowed"
                    : "bg-[#1a3300] text-[#ffe95c] hover:opacity-90"
                }`}
              >
                {subscription?.status === "paused"
                  ? "Återuppta abonnemang"
                  : "Pausa abonnemang"}
              </button>
            </div>

            <hr className="border-gray-200" />

            {/* ================= CANCEL ================= */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Avsluta abonnemang</h3>
              <p className="text-gray-600 leading-relaxed">
                Är du säker på att du vill avsluta? Du kan pausa istället och
                behålla ditt konto.
              </p>
              <div className="relative group inline-block">
                <button
                  disabled={subscription?.status === "paused"}
                  onClick={() =>
                    setConfirmType(
                      subscription?.status === "canceling" ? "uncancel" : "cancel",
                    )
                  }
                  className={`underline transition ${
                    subscription?.status === "paused"
                      ? "text-black opacity-50 pointer-events-none"
                      : "text-black hover:opacity-60"
                  }`}
                >
                  {subscription?.status === "canceling"
                    ? "Ångra avslut"
                    : "Avsluta abonnemang"}
                </button>
                {subscription?.status === "paused" && (
                  <div className="absolute bottom-full left-0 mb-2 w-64 bg-black text-white text-sm rounded-xl px-4 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Ditt abonnemang är pausat. Återuppta abonnemanget först för att kunna avsluta det.
                  </div>
                )}
              </div>
            </div>
          </div>
        </AccordionCard>

        <AccordionCard
          title="Orderhistorik"
          isOpen={openSection === "orders"}
          onToggle={() => toggleSection("orders")}
        >
          <div className="space-y-6">
            {invoices.length === 0 && (
              <p className="text-gray-500 text-sm">
                Inga tidigare beställningar.
              </p>
            )}

            {invoices.map((invoice, index) => (
              <div key={invoice.id}>
                <div className="flex justify-between items-start gap-4">
                <div>
                    <div className="font-semibold">
                      {new Date(invoice.date * 1000).toLocaleDateString("sv-SE")}
                    </div>
                    <div className="text-gray-500 text-sm">
                      Betalning #{invoice.shortId}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-semibold">
                      {(invoice.amount / 100).toFixed(0)} kr
                    </div>
                    <div className="text-gray-500 text-sm">Levererad</div>
                  </div>
                    <a
                    href={invoice.receipt_url}
                    target="_blank"
                    className="underline text-sm"
                  >
                    Visa kvitto
                  </a>
                </div>

                {index !== invoices.length - 1 && (
                  <hr className="border-gray-200 mt-6" />
                )}
              </div>
            ))}
          </div>
        </AccordionCard>

        <div className="rounded-2xl bg-card shadow-sm p-6 space-y-3">
          <h2 className="text-[20px] font-extrabold tracking-[-0.3px] text-foreground">
            Ändra kortuppgifter
          </h2>
          <button
            onClick={() => handleOpenPortal("payment")}
            disabled={portalLoading === "payment"}
            className="underline text-base text-foreground disabled:opacity-50"
          >
            {portalLoading === "payment" ? "Laddar..." : "Uppdatera betalmetod"}
          </button>
        </div>

        <div className="rounded-2xl bg-card shadow-sm p-6 space-y-3">
          <h2 className="text-[20px] font-extrabold tracking-[-0.3px] text-foreground">
            Ändra adress
          </h2>
          {customerAddress && (
            <p className="text-base text-muted-foreground">
              {[
                customerAddress.line1,
                customerAddress.line2,
                customerAddress.postal_code,
                customerAddress.city,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
          <button
            onClick={() => handleOpenPortal("address")}
            disabled={portalLoading === "address"}
            className="underline text-base text-foreground disabled:opacity-50"
          >
            {portalLoading === "address" ? "Laddar..." : "Uppdatera adress"}
          </button>
        </div>

      </div>

      {/* ================= PAUSE SELECTOR MODAL ================= */}

      {showPauseSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 w-[90%] max-w-sm space-y-6 shadow-lg">

            <h2 className="text-lg font-semibold">Hur vill du pausa</h2>

            <div className="space-y-4">
              {(["skip_one", "indefinite"] as const).map((type) => {
                const isDisabled = type === "skip_one" && hasSchedule;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => !isDisabled && setPauseType(type)}
                    className={`w-full flex items-start gap-4 text-left ${isDisabled ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <div className={`mt-0.5 shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      pauseType === type ? "border-black bg-black" : "border-gray-400 bg-white"
                    }`}>
                      {pauseType === type && (
                        <div className="w-2.5 h-2.5 rounded-full bg-white" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-base">
                        {type === "skip_one" ? "Pausa kommande leverans" : "Pausa tillsvidare"}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {type === "skip_one"
                          ? "Din nästa leverans hoppas över och du debiteras inte. Därefter återupptas abonnemanget automatiskt och leveranserna fortsätter som vanligt."
                          : "Abonnemanget pausas och du får inga fler leveranser förrän du själv väljer att återuppta det. Du debiteras inte under pausen. Perfekt om du har olivolja kvar och inte vet när du vill ha mer."}
                      </p>
                      {type === "skip_one" && hasSchedule && (
                        <p className="text-xs text-gray-400 mt-1">
                          Du har nyligen ändrat leveransfrekvens och kan inte hoppa över en leverans just nu.
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <button
                onClick={() => {
                  setShowPauseSelector(false);
                  setConfirmType("pause");
                }}
                className="w-full bg-[#1a3300] text-[#ffe95c] rounded-full py-4 font-semibold hover:opacity-90 transition"
              >
                Spara ändringar
              </button>
              <button
                onClick={() => {
                  setShowPauseSelector(false);
                  setPauseType("skip_one");
                }}
                className="text-center underline text-gray-600 text-base"
              >
                Avbryt
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================= MODAL ================= */}

      {confirmType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 w-[90%] max-w-sm space-y-4 shadow-lg">

            <h2 className="text-lg font-semibold">
              {confirmType === "cancel"
                ? "Är du säker på att du vill avsluta?"
                : confirmType === "uncancel"
                ? "Vill du ångra ditt avslut?"
                : confirmType === "pauseIndefiniteFromCancel"
                ? "Vill du pausa abonnemanget tills vidare?"
                : confirmType === "pause"
                ? (pauseType === "skip_one" ? "Pausa kommande leverans?" : "Vill du pausa abonnemanget tills vidare?")
                : confirmType === "unpause"
                ? "Återuppta ditt abonnemang?"
                : confirmType === "changePlan"
                ? "Bekräfta din ändring"
                : "Är du säker?"}
            </h2>

            <p className="text-sm text-gray-600">
              {confirmType === "pause" && pauseType === "skip_one" &&
                "Din kommande leverans hoppas över och du debiteras inte. Abonnemanget återupptas sedan automatiskt."}
              {confirmType === "pause" && pauseType === "indefinite" &&
                "Abonnemanget pausas tillsvidare och du får inga fler leveranser eller debiteringar förrän du väljer att starta igen. Du kan återuppta när som helst."}
              {confirmType === "pauseIndefiniteFromCancel" &&
                "Abonnemanget pausas tillsvidare och du får inga fler leveranser eller debiteringar förrän du väljer att starta igen. Du kan återuppta när som helst."}
              {confirmType === "unpause" &&
                "Abonnemanget aktiveras igen och du får din nästa leverans på ordinarie datum. Välkommen tillbaka!"}
              {confirmType === "cancel" && (
                <>
                  Visste du att du även kan pausa ditt abonnemang? Då får du ingen mer olivolja förrän du själv säger till och väljer själv när du ska aktivera det igen.
                  <br /><br />
                  När du avslutar tar vi bort ditt konto i sin helhet och du behöver registrera dig på nytt för att beställa igen, kanske till ett dyrare pris.
                </>
              )}
              {confirmType === "uncancel" &&
                "Välkommen tillbaka! Om du ångrar avslutet fortsätter ditt abonnemang som vanligt och du får din nästa leverans på det datum som gäller. Ingenting ändras och du behöver inte göra något mer."}
              {confirmType === "changePlan" && (
                <>
                  Du håller på att ändra ditt abonnemang till {selectedVolume} / {formatInterval(selectedInterval)}.
                  <br /><br />
                  Ändringen träder i kraft direkt och din nästa leverans kommer enligt det nya upplägget. Du debiteras inte något extra för ändringen.
                </>
              )}
            </p>

            {confirmType === "cancel" ? (
              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setConfirmType(null)}
                  disabled={actionLoading}
                  className="underline text-gray-600 text-base disabled:opacity-50"
                >
                  Avbryt
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPauseType("indefinite");
                      setConfirmType("pauseIndefiniteFromCancel");
                    }}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-lg border disabled:opacity-50"
                  >
                    Pausa
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleModalConfirm}
                    className="px-4 py-2 rounded-lg bg-[#1a3300] text-[#ffe95c] disabled:opacity-70 flex items-center justify-center min-w-[48px]"
                  >
                    {actionLoading ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Avsluta"
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center pt-4">
                <button
                  onClick={() => setConfirmType(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg border disabled:opacity-50"
                >
                  Nej
                </button>

                <button
                  disabled={actionLoading}
                  onClick={handleModalConfirm}
                  className="px-4 py-2 rounded-lg bg-[#1a3300] text-[#ffe95c] disabled:opacity-70 flex items-center justify-center min-w-[48px]"
                >
                  {actionLoading ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Ja"
                  )}
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ================= TOAST ================= */}

      {toastMessage && (
        <div className="fixed top-6 right-6 bg-white text-black border border-gray-200 px-6 py-3 rounded-xl shadow-lg">
          {toastMessage}
        </div>
      )}

    </main>
  );
}