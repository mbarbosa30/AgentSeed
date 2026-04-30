import { Link, useLocation } from "wouter";
import { Zap, RadioTower } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const [location] = useLocation();

  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 group"
          data-testid="nav-logo"
        >
          <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <span className="font-bold text-base tracking-tight text-foreground">
            Agent<span className="text-primary">Seed</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link href="/event" data-testid="nav-event">
            <Button
              variant={location === "/event" ? "default" : "ghost"}
              size="sm"
              className="gap-1.5"
            >
              <RadioTower className="w-3.5 h-3.5" />
              Event Mode
            </Button>
          </Link>
          <Link href="/" data-testid="nav-create">
            <Button
              variant={location === "/" ? "default" : "outline"}
              size="sm"
            >
              + Create Agent
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
