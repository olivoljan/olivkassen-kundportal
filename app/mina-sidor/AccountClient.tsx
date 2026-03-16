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

  const hasSchedule = !!(subscription as any)?.schedule;

  useEffect(() => {
    if (hasSchedule) setPauseType("indefinite");
  }, [hasSchedule]);

  const [confirmType, setConfirmType] = useState<
    "pause" | "unpause" | "cancel" | "uncancel" | "changePlan" | "extraOrder" | null
  >(null);

  const [orderingExtra, setOrderingExtra] = useState(false);
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

      console.log("sub response:", sub); // ADD THIS LINE

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
    setOpenSection(null);
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

        <PortalHeader user={session?.user} nextDelivery={nextDelivery} isPaused={subscription?.status === "paused"} loading={loading} subscriptionStatus={subscription?.status} />

        {/* ================= EXTRA BESTÄLLNING ================= */}

        <AccordionCard
          title={
            <div>
              <div className="text-white font-extrabold">Extra beställning</div>
              {openSection !== "extraOrder" && (
                <div className="text-white text-sm font-normal mt-0.5">
                  Behöver du mer olivolja? Beställ en extra leverans direkt.
                </div>
              )}
            </div>
          }
          cardClassName="bg-[#6AAF5E] text-white"
          chevronClassName="text-white"
          isOpen={openSection === "extraOrder"}
          onToggle={() => toggleSection("extraOrder")}
        >
          <p className="text-white leading-relaxed">
            Behöver du mer olivolja – här kan du göra en extra beställning
            som inte påverkar ditt befintliga abonnemang.
          </p>
          <button
            onClick={() => setConfirmType("extraOrder")}
            disabled={orderingExtra}
            className="mt-4 bg-white text-black rounded-full px-6 py-4 font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {orderingExtra ? "Beställer..." : "Engångsbeställning"}
          </button>
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
                <h3 className="text-xl font-bold mb-0">Ändra abonnemang</h3>
                {subscription?.status === "canceling" ? (
                  <p className="text-sm text-muted-foreground">
                    Abonnemanget är avslutat
                  </p>
                ) : subscription?.status === "paused" ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <span>Abonnemanget är pausat</span>
                    <PauseCircle className="w-4 h-4 shrink-0" />
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aktivt abonnemang: <span className="font-medium text-foreground">{activeVolume} / {formatInterval(activeInterval)}</span>
                  </p>
                )}

                {/* ================= VOLUME FIRST ================= */}
                <div className="space-y-3">
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
                <div className="space-y-3">
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
                    disabled={(v) => v === "6m" && activeInterval === "1m"}
                  />
                </div>

                {/* ================= ACTION BUTTONS ================= */}
                <div className="flex items-center justify-between gap-6 pt-2">
                  <button
                    onClick={() => setConfirmType("changePlan")}
                    disabled={updatingPlan}
                    className="flex-1 bg-black text-white rounded-full py-5 font-semibold disabled:opacity-50 transition hover:opacity-90"
                  >
                    {updatingPlan ? "Uppdaterar..." : "Spara ändringar"}
                  </button>

                  <button
                    onClick={() => toggleSection("subscription")}
                    className="underline text-gray-600 whitespace-nowrap text-base"
                  >
                    Avbryt
                  </button>
                </div>

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
                className={`px-6 py-3 rounded-full font-semibold transition ${
                  subscription?.status === "canceled" || subscription?.status === "canceling"
                    ? "bg-black text-white opacity-40 cursor-not-allowed"
                    : "bg-black text-white hover:opacity-90"
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
                          ? "Din nästa leverans utgår och därefter löper abonnemanget på som vanligt"
                          : "Abonnemanget pausat tillsvidare. Behöver aktivera för framtida leveranser"}
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
                className="w-full bg-black text-white rounded-full py-4 font-semibold hover:opacity-90 transition"
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
              Är du säker?
            </h2>

            <p className="text-sm text-gray-600">
              {confirmType === "pause" &&
                "Vill du pausa ditt abonnemang?"}
              {confirmType === "unpause" &&
                "Vill du återuppta ditt abonnemang?"}
              {confirmType === "cancel" &&
                "Vill du avsluta ditt abonnemang?"}
              {confirmType === "uncancel" &&
                "Vill du ångra avslutet?"}
              {confirmType === "changePlan" &&
                `Vill du ändra till ${selectedVolume} / ${formatInterval(selectedInterval)}?`}
              {confirmType === "extraOrder" &&
                `Vill du beställa en extra leverans av ${activeVolume} olivolja? Du debiteras ${activeVolume === "3L" ? "598" : "598"} kr direkt.`}
            </p>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setConfirmType(null)}
                className="px-4 py-2 rounded-lg border"
              >
                Nej
              </button>

              <button
                onClick={async () => {
                  setActionLoading(true);

                  if (confirmType === "pause" || confirmType === "unpause") {
                    await handlePauseResume();
                    setOpenSection(null);
                    showToast(
                      confirmType === "pause"
                        ? "Abonnemanget är pausat"
                        : "Abonnemanget är återupptaget"
                    );
                  }

                  if (confirmType === "cancel") {
                    await handleCancel(false);
                    setOpenSection(null);
                    showToast(
                      "Abonnemanget avslutades"
                    );
                  }

                  if (confirmType === "uncancel") {
                    await handleCancel(true);
                    setOpenSection(null);
                    showToast("Avslutet har ångrats");
                  }

                  if (confirmType === "changePlan") {
                    await handleChangePlan();
                  }

                  if (confirmType === "extraOrder") {
                    setOrderingExtra(true);
                    const res = await safeFetch("/api/stripe/one-time-order", {
                      userId: session.user.id,
                    });
                    setOrderingExtra(false);
                    if (res?.success) showToast("En faktura har skickats till din e-post. Betala inom 3 dagar. 🫒", 8000);
                    else showToast(res?.error ?? "Något gick fel", 9000);
                  }

                  setConfirmType(null);
                  setActionLoading(false);
                }}
                className="px-4 py-2 rounded-lg bg-black text-white"
              >
                Ja
              </button>
            </div>

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