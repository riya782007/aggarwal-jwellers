import { IconSearch } from "./Icons";

/** Always-visible native GET search (including WhatsApp in-app / mobile).
 *  Hidden-on-mobile icon-only used to make the bar look "gone" on phones. */
export function SearchBox() {
  return (
    <form
      action="/search"
      method="get"
      className="flex flex-1 min-w-0 max-w-xl items-center bg-ivory border border-sand rounded-full px-3 py-2 md:px-4 md:py-2.5 focus-within:border-gold transition-colors"
    >
      <IconSearch className="w-4 h-4 text-ink/40 shrink-0" />
      <input
        type="text"
        name="q"
        placeholder='Search "Jhumka", "Kundan Set", "Kada"…'
        enterKeyHint="search"
        autoComplete="off"
        aria-label="Search designs"
        className="bg-transparent outline-none text-sm px-2 md:px-3 min-w-0 w-full h-6 placeholder:text-ink/40"
      />
      <button type="submit" className="shrink-0 text-sm font-medium text-emerald hover:text-ink">Search</button>
    </form>
  );
}
