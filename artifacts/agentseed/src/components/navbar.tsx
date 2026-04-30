import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const [location] = useLocation();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2"
          data-testid="nav-logo"
        >
          <span className="font-semibold text-[15px] tracking-tight text-foreground">
            AgentSeed
          </span>
          <span className="hidden sm:inline text-xs text-muted-foreground font-normal">
            / agents protocol
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <Link href="/event" data-testid="nav-event">
            <Button
              variant="ghost"
              size="sm"
              className={`text-sm font-normal ${
                location === "/event"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Event mode
            </Button>
          </Link>
          <Link href="/" data-testid="nav-create">
            <Button
              size="sm"
              className="text-sm h-8"
            >
              Create agent
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
