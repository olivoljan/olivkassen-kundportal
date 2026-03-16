"use client";

type SubscriptionSectionProps = {
  subscription: any;
  onPauseResume: () => void;
  onCancel: () => void;
  onUndoCancel: () => void;
  onPortal: () => void;
};

export function SubscriptionSection({
  subscription,
  onPauseResume,
  onCancel,
  onUndoCancel,
  onPortal,
}: SubscriptionSectionProps) {
  if (!subscription) return null;

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return null;
    return new Date(timestamp * 1000).toLocaleDateString("sv-SE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm space-y-6">
      {/* Status */}
      <div>
        {subscription.status === "active" && (
          <div className="inline-block rounded-full bg-green-100 px-4 py-1 text-sm font-medium text-green-700">
            Aktiv prenumeration
          </div>
        )}

        {subscription.status === "paused" && (
          <div className="inline-block rounded-full bg-yellow-100 px-4 py-1 text-sm font-medium text-yellow-800">
            Pausad prenumeration
          </div>
        )}

        {subscription.status === "canceling" && (
          <div className="inline-block rounded-full bg-amber-100 px-4 py-1 text-sm font-medium text-amber-800">
            Avslutad
          </div>
        )}

        {subscription.status === "canceled" && (
          <div className="inline-block rounded-full bg-red-100 px-4 py-1 text-sm font-medium text-red-700">
            Avslutad
          </div>
        )}
      </div>

      {/* Product */}
      {subscription.status !== "canceled" && (
        <>
          <div className="space-y-2">
            <p>
              <strong>Produkt:</strong> {subscription.product}
            </p>

            <p>
              <strong>Pris:</strong>{" "}
              {(subscription.amount / 100).toFixed(2)}{" "}
              {subscription.currency?.toUpperCase()} – var{" "}
              {subscription.interval_count}:e månad
            </p>

            {subscription.current_period_end && (
              <p>
                <strong>Nästa leverans:</strong>{" "}
                {formatDate(subscription.current_period_end)}
              </p>
            )}
          </div>

          {/* Primary button */}
          <button
            onClick={onPortal}
            className="w-full h-[43px] rounded-full bg-[#203208] text-[#FBEA74] text-[18px] font-medium"
          >
            Hantera prenumeration
          </button>

          {/* Links */}
          <div className="flex flex-col gap-2">
            <button
              onClick={onPauseResume}
              className="text-black underline text-left"
            >
              {subscription.status === "paused"
                ? "Återuppta prenumeration"
                : "Pausa prenumeration"}
            </button>

            {subscription.status === "canceling" ? (
              <button
                onClick={onUndoCancel}
                className="text-black underline text-left"
              >
                Ångra avslut
              </button>
            ) : (
              <button
                onClick={onCancel}
                className="text-black underline text-left"
              >
                Avsluta prenumeration
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}