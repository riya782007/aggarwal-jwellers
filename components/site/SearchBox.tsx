import Link from "next/link";
import { IconSearch } from "./Icons";

export function SearchBox() {
  return (
    <>
      {/* Desktop: native GET so Enter submits even if client JS is slow (WhatsApp in-app browser). */}
      <form
        action="/search"
        method="get"
        className="hidden md:flex flex-1 max-w-xl items-center bg-ivory border border-sand rounded-full px-4 py-2.5 focus-within:border-gold transition-colors">
        <IconSearch className="w-4 h-4 text-ink/40 shrink-0" />
        <input
          type="search"
          name="q"
          placeholder='Search "Jhumka", "Kundan Set", "Kada"…'
          enterKeyHint="search"
          autoComplete="off"
          aria-label="Search designs"
          className="bg-transparent outline-none text-sm px-3 w-full placeholder:text-ink/40"
        />
        <button type="submit" className="shrink-0 text-sm font-medium text-emerald hover:text-ink">Search</button>
      </form>
      {/* Mobile: search icon → search page (the page itself has the input) */}
      <Link href="/search" aria-label="Search" title="Search"
        className="md:hidden p-2 rounded-full hover:bg-ivory transition-colors"><IconSearch /></Link>
    </>
  );
}
