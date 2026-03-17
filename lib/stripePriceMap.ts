/* =========================================
   LIVE STRIPE PRICE IDS
========================================= */

export const LIVE_PRICES = {
    "2l-1m": "price_1SEXu3ClYp4p5ca6nJpwO6pW",
    "2l-3m": "price_1SEXu3ClYp4p5ca62Q5re5OQ",
    "2l-6m": "price_1SEXu3ClYp4p5ca6mKjHT5P0",
  
    "3l-1m": "price_1SEXynClYp4p5ca6EejRMOYV",
    "3l-3m": "price_1SEXynClYp4p5ca6vGv31syB",
    "3l-6m": "price_1SEXynClYp4p5ca6OC9hkb2c",
  };
  
  /* =========================================
     TEST STRIPE PRICE IDS
  ========================================= */
  
  export const TEST_PRICES = {
    "2l-1m": "price_1SCnrwEKCocP3sE0IEtNGNrf",
    "2l-3m": "price_1SCnrwEKCocP3sE06kNcBy2X",
    "2l-6m": "price_1SCnrwEKCocP3sE0QwtcBykt",
  
    "3l-1m": "price_1SCneBEKCocP3sE035p9ANCI",
    "3l-3m": "price_1SCneBEKCocP3sE0zItMU5kX",
    "3l-6m": "price_1SCneBEKCocP3sE0JCfmIl3P",
  };
  
  /* =========================================
     TYPES
  ========================================= */
  
  export type Volume = "1L" | "2L" | "3L";
  export type Interval = "1m" | "3m" | "6m";
  
  /* =========================================
     LEGACY LIVE STRIPE PRICE IDS
     (for reverse lookup only)
  ========================================= */

  export const LIVE_PRICES_LEGACY = {
    "3l-1m-legacy": "price_1Qzj8gClYp4p5ca6GDHQUs5y",
    "3l-3m-legacy": "price_1QzjA6ClYp4p5ca6pH19JVGW",
    "3l-6m-legacy": "price_1QzjCvClYp4p5ca6PSC6gPsT",
    "2l-1m-legacy": "price_1RAXleClYp4p5ca6sC7VlVmq",
    "2l-3m-legacy": "price_1RAXUSClYp4p5ca6cgMVvaZa",
    "2l-6m-legacy": "price_1RAXZyClYp4p5ca6IheU4vvv",
    "1l-1m-legacy": "price_1R9BoFClYp4p5ca60D7yhTMK",
    "1l-3m-legacy": "price_1R9QksClYp4p5ca6d8QIyIbX",
    "1l-6m-legacy": "price_1R9QWrClYp4p5ca6NfiKoEvX",
  };

  /* =========================================
     REVERSE PRICE MAP GENERATOR
     (price_id → volume + interval)
  ========================================= */
  
  function createReverseMap(
    prices: Record<string, string>
  ): Record<string, { volume: Volume; interval: Interval }> {
    const map: Record<string, { volume: Volume; interval: Interval }> = {};
  
    Object.entries(prices).forEach(([key, priceId]) => {
      const cleanKey = key.replace("-legacy", "");
      const [volumeRaw, interval] = cleanKey.split("-");
  
      const volume = volumeRaw.toUpperCase() as Volume;
  
      map[priceId] = {
        volume,
        interval: interval as Interval,
      };
    });
  
    return map;
  }
  
  /* =========================================
     EXPORT REVERSE MAPS
  ========================================= */
  
  export const LIVE_PRICE_MAP = {
    ...createReverseMap(LIVE_PRICES),
    ...createReverseMap(LIVE_PRICES_LEGACY),
  };
  export const TEST_PRICE_MAP = createReverseMap(TEST_PRICES);
  
  /* =========================================
     HELPER — Select correct environment map
  ========================================= */
  
  export const PRICE_MAP =
    process.env.NODE_ENV === "production"
      ? LIVE_PRICE_MAP
      : TEST_PRICE_MAP;