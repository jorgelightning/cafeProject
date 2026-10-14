// The shapes the app stores. Written from what saveForm() writes and what the sync/merge code
// reads, so a change to a record shape starts here. Everything optional is optional because an
// older record, or one Firebase returned with its empty fields dropped, may not have it:
// Firebase stores no nulls, so "no pin" arrives as MISSING lat/lng, not null (the 29 Sep bug).

/** One dated order of a drink. Dates are "YYYY-MM-DD". */
interface Order {
  id?: string;
  date?: string;
  /** price in US dollars; pl/pc keep the amount as it was written (local money) */
  p?: string | number;
  pl?: string | number;
  pc?: string;
  /** exchange rate used, and the day it came from (frozen when the drink is logged) */
  pr?: number;
  pd?: string;
  qty?: number;
  size?: string;
  sweet?: string;
  ice?: string;
  milk?: string;
  reorder?: "yes" | "no" | "neutral";
}

/** A drink, with its orders. Top-level fields mirror the latest order for older clients. */
interface Drink extends Order {
  /** name */
  n: string;
  orders?: Order[];
  /** legacy shape, from before orders existed: a list of dates and a count */
  dates?: string[];
  count?: number | string;
}

interface Cafe {
  /** [A-Za-z0-9_-]{1,64}; anything else is refused by adoptCafes() */
  id: string;
  name: string;
  area?: string;
  brand?: string;
  lat?: number | null;
  lng?: number | null;
  /** 1–2 not for me, 3 fine, 4–5 loved; new writes use 5/3/1 */
  rating?: number;
  elo?: number;
  matches?: number;
  fav?: boolean;
  /** want to try */
  wish?: boolean;
  /** private spot: its exact location lives under private/, never here */
  custom?: boolean;
  tags?: string[];
  review?: string;
  photo?: string | null;
  gphoto?: string;
  /** Google place id, ISO country, currency */
  pid?: string;
  cc?: string;
  ccy?: string;
  emoji?: string;
  drinks?: Drink[];
  updated?: string;
}

/** What is kept under private/<id> for a private spot, readable only by the owner. */
interface PrivateDetail {
  area?: string;
  lat?: number | null;
  lng?: number | null;
}
