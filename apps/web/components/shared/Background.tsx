// /web/components/shared/Background.tsx
export const Background = () => {
  return (
    <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden bg-background">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#4F5B6D 1px, transparent 1px), linear-gradient(90deg, #4F5B6D 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }}
      />

      <div
        className="absolute top-[-10%] left-[20%] w-[800px] h-[800px] bg-primary/5 rounded-full blur-[160px] animate-pulse"
        style={{ animationDuration: "12s" }}
      />
      <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-secondary/5 rounded-full blur-[140px]" />

      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
};
