import {
  ArrowRight, ArrowLeft, ArrowUp, ArrowDown, ArrowUpDown, ArrowLeftRight,
  ArrowUpRight, ArrowDownLeft, ArrowUpFromLine, ArrowDownToLine, Undo2, RotateCw, RefreshCw,
  Check, CheckCircle2, CheckSquare, X, XCircle, Ban,
  Sparkle, Sparkles, Star, Heart, Link2, PartyPopper, Gift, Ticket,
  Package, Boxes, Layers, Trash2, Circle, CircleDot, Dot, Square,
  AlertTriangle, AlertCircle, Info, Clock, Hourglass,
  Pencil, Zap, Camera, Image as ImageIcon, Palette,
  ShoppingBag, ShoppingCart, Store, Search, Download, Upload,
  Eye, EyeOff, Landmark, Bookmark, Target, Crosshair, Inbox, Mail, Send,
  Bot, Bell, Hammer, Wrench, Plus, PlusCircle, MinusCircle, Minus, Printer, Tag,
  IndianRupee, Wallet, Coins, Receipt, FileText, Percent, Repeat,
  LayoutDashboard, LayoutGrid, Grid3x3, List, Users, UserCog, Shield, ShieldCheck,
  KeyRound, ScrollText, ClipboardList, TrendingUp, LineChart, Truck, Share2,
  Megaphone, Film, Play, Filter, ThumbsUp, MessageCircle, Phone, MapPin, Menu,
  Mic, Home, Volume2, VolumeX, Gem, Settings, Shuffle, Frown, Award,
  ChevronRight, ChevronDown, ChevronLeft, ChevronUp, type LucideIcon,
} from "lucide-react";

/**
 * Central icon map — the ONLY place jewellery-site iconography is defined.
 * Two ways to reference an icon so both hand-written and bulk-converted call sites stay consistent:
 *   <Icon name="cart" />   semantic name (preferred for new code)
 *   <Icon g="🛒" />        the original emoji/glyph it replaced (used by the de-emoji pass)
 * Anything unmapped falls back to a small dot rather than crashing the page.
 */
const BY_NAME: Record<string, LucideIcon> = {
  // arrows / navigation
  arrowRight: ArrowRight, arrowLeft: ArrowLeft, arrowUp: ArrowUp, arrowDown: ArrowDown,
  arrowUpDown: ArrowUpDown, arrowLeftRight: ArrowLeftRight, arrowUpRight: ArrowUpRight,
  arrowDownLeft: ArrowDownLeft, back: Undo2, refresh: RotateCw, sync: RefreshCw,
  chevronRight: ChevronRight, chevronDown: ChevronDown, chevronLeft: ChevronLeft, chevronUp: ChevronUp,
  sortUp: ArrowUp, sortDown: ArrowDown, sort: ArrowUpDown, menu: Menu,
  // state
  check: Check, checkCircle: CheckCircle2, checkSquare: CheckSquare, close: X, cancel: XCircle, ban: Ban,
  warn: AlertTriangle, alert: AlertCircle, info: Info, clock: Clock, pending: Hourglass,
  dotRed: CircleDot, dotAmber: CircleDot, square: Square,
  // catalogue / product
  catalogue: Sparkle, product: Package, boxes: Boxes, layers: Layers, tag: Tag,
  photo: Camera, image: ImageIcon, palette: Palette, sparkles: Sparkles, star: Star, edit: Pencil,
  add: Plus, addCircle: PlusCircle, removeCircle: MinusCircle, remove: Minus, trash: Trash2,
  hide: EyeOff, show: Eye, label: Tag, barcode: ClipboardList, printer: Printer,
  // commerce
  cart: ShoppingCart, bag: ShoppingBag, store: Store, order: ShoppingCart, truck: Truck,
  rupee: IndianRupee, wallet: Wallet, coins: Coins, receipt: Receipt, percent: Percent,
  invoice: FileText, estimate: FileText, repeat: Repeat,
  // people / control
  dashboard: LayoutDashboard, grid: LayoutGrid, list: List, analytics: LineChart, trend: TrendingUp,
  customers: Users, roles: UserCog, shield: Shield, approve: ShieldCheck, key: KeyRound,
  suppliers: Hammer, purchases: ArrowUpFromLine, notifications: Mail, inbox: Inbox, bot: Bot,
  bell: Bell, submissions: Inbox, employees: Users, stockMove: ArrowUpDown, bank: Landmark,
  // growth
  promo: PartyPopper, gift: Gift, voucher: Ticket, reels: Film, play: Play, notify: Bell,
  abandoned: Ban, marketing: Megaphone, reviews: Star, share: Share2, filter: Filter,
  // misc
  link: Link2, heart: Heart, target: Target, crosshair: Crosshair, bookmark: Bookmark,
  search: Search, download: Download, upload: Upload, send: Send, phone: Phone, mapPin: MapPin,
  message: MessageCircle, thumbsUp: ThumbsUp, zap: Zap, wrench: Wrench, mic: Mic, home: Home,
  volumeOn: Volume2, volumeOff: VolumeX,
  gem: Gem, settings: Settings, shuffle: Shuffle, frown: Frown, award: Award,
};

// Raw glyph → semantic name. Keeps the bulk de-emoji conversion mechanical and reviewable.
const BY_GLYPH: Record<string, string> = {
  "→": "arrowRight", "←": "arrowLeft", "↑": "arrowUp", "↓": "arrowDown",
  "↔": "arrowLeftRight", "↕": "sort", "↗": "arrowUpRight", "↩": "back", "↻": "refresh",
  "⇅": "stockMove", "⇪": "purchases", "⬆": "arrowUp", "⬇": "download",
  "✓": "check", "✅": "checkCircle", "✔": "check", "✕": "close", "✖": "close", "❌": "cancel", "⊘": "ban", "🚫": "ban",
  "✦": "catalogue", "✧": "catalogue", "✨": "sparkles", "★": "star", "☆": "star", "⭐": "star",
  "♡": "heart", "❤": "heart", "💛": "heart", "💚": "heart", "🔗": "link",
  "🎉": "promo", "🎊": "promo", "🎁": "gift", "🎟": "voucher", "🎫": "voucher",
  "📦": "product", "🗑": "trash", "🟡": "dotAmber", "🔴": "dotRed", "🟢": "checkCircle", "🔵": "dotRed",
  "⚠": "warn", "⚠️": "warn", "ℹ": "info", "ℹ️": "info", "⏳": "pending", "⏰": "clock", "🕐": "clock",
  "✏": "edit", "✏️": "edit", "✍": "edit", "📝": "edit", "⚡": "zap", "📷": "photo", "📸": "photo", "🖼": "image", "🖼️": "image",
  "🛍": "bag", "🛍️": "bag", "🛒": "cart", "🔎": "search", "🔍": "search", "🎨": "palette",
  "👁": "show", "👁️": "show", "🙈": "hide", "🏦": "bank", "🔖": "bookmark", "🎯": "target",
  "📥": "submissions", "📤": "share", "✉": "notifications", "✉️": "notifications", "📧": "notifications",
  "🤖": "bot", "🔔": "notify", "⚒": "suppliers", "⚒️": "suppliers", "🔨": "suppliers", "🛠": "wrench",
  "＋": "add", "➕": "addCircle", "➖": "removeCircle", "🖶": "printer", "🖨": "printer", "🏷": "tag", "🏷️": "tag",
  "⌖": "crosshair", "⬜": "square", "◻": "square", "▪": "square", "▫": "square",
  "♚": "customers", "♛": "customers", "⚿": "key", "🔑": "key", "🔐": "key",
  "❑": "list", "▦": "grid", "▥": "barcode", "▷": "reels", "◷": "analytics", "≈": "estimate",
  "₹": "rupee", "💰": "coins", "💳": "wallet", "🧾": "receipt", "📊": "analytics", "📈": "trend", "📉": "trend",
  "🏬": "store", "🏪": "store", "🚚": "truck", "📣": "marketing", "📢": "marketing", "🎥": "reels",
  "👍": "thumbsUp", "💬": "message", "📞": "phone", "📍": "mapPin", "⭑": "star",
  "⤺": "back", "☺": "employees", "☹": "message", "○": "pending", "◔": "pending", "◑": "pending", "—": "remove",
  "🏭": "store", "💵": "coins", "🕑": "clock", "🕒": "clock", "✎": "edit", "🎤": "mic", "💡": "zap", "🔒": "key", "🔓": "key",
  "⇆": "repeat", "💤": "clock", "🚨": "warn", "📋": "barcode", "🏠": "home", "🗓": "clock", "📅": "clock", "🔧": "wrench",
  "🔊": "volumeOn", "🔇": "volumeOff", "➤": "send", "➜": "arrowRight", "»": "chevronRight", "«": "chevronLeft", "●": "dotRed",
  "✗": "close", "💵": "coins", "📱": "phone", "📲": "phone", "💎": "gem", "💍": "gem", "🎲": "shuffle",
  "⚙️": "settings", "⚙": "settings", "😕": "frown", "🙁": "frown", "🙏": "heart", "📄": "invoice",
  "🥇": "award", "🏆": "award", "🟠": "dotAmber", "🧿": "shield", "🪔": "sparkles", "👗": "tag", "💄": "sparkles", "🖥": "store",
  "◼": "square", "◾": "square", "■": "square", "↺": "refresh", "✎": "edit", "✦": "catalogue",
};

type IconProps = {
  name?: string;
  g?: string;
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
  title?: string;
};

export function Icon({ name, g, className = "w-4 h-4", strokeWidth = 2, title, ...rest }: IconProps) {
  const key = name ?? (g ? BY_GLYPH[g] : undefined);
  const Cmp = (key && BY_NAME[key]) || Dot;
  return <Cmp className={className} strokeWidth={strokeWidth} aria-hidden={title ? undefined : true} {...(title ? { "aria-label": title } : {})} {...rest} />;
}

export default Icon;
