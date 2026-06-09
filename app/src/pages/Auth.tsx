import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useAuth } from "@/contexts/AuthContext";

gsap.registerPlugin(ScrollTrigger);

const ROLES = [
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
];


export default function AuthPage() {
  const { login, register, user } = useAuth();
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLElement>(null);

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"buyer" | "seller">("buyer");
  const [tradeLicense, setTradeLicense] = useState("");

  useEffect(() => {
    if (user) {
      navigate(user.role === "buyer" ? "/dashboard/buyer" : "/dashboard/seller", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".auth-fade", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: "power3.out" });
    }, section);
    return () => ctx.revert();
  }, [tab]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back!");
    } catch (err: any) {
      setError(err.detail || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (role === "seller" && !tradeLicense.trim()) {
      setError("Trade license is required for sellers.");
      return;
    }
    setLoading(true);
    try {
      await register({
        name,
        email,
        password,
        role,
        ...(role === "seller" ? { trade_license: tradeLicense } : {}),
      } as Parameters<typeof register>[0]);
      toast.success("Account created! Welcome to Jhutlink.");
    } catch (err: any) {
      setError(err.detail || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden"
    >
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(180deg, #030303 0%, #0a0b0d 50%, #030303 100%)",
          zIndex: -1,
        }}
      />

      <div className="relative z-[1] w-full max-w-md mx-auto px-6 auth-fade">
        {/* Brand */}
        <Link to="/" className="flex items-center justify-center gap-1.5 mb-8">
          <span
            className="font-display text-2xl font-semibold text-text-primary tracking-tight"
            style={{ fontFamily: '"Clash Display", system-ui' }}
          >
            jhutlink
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse-glow" />
        </Link>

        {/* Card */}
        <div
          className="glass-card p-8"
          style={{ background: "rgba(10,11,13,0.8)", backdropFilter: "blur(16px)" }}
        >
          <Tabs
            value={tab}
            onValueChange={(v) => { setTab(v as "signin" | "signup"); setError(""); }}
            className="w-full"
          >
            <TabsList className="w-full grid grid-cols-2 mb-6 h-auto p-0 bg-muted/40 rounded-xl overflow-hidden">
              <TabsTrigger
                value="signin"
                className="rounded-none py-3 text-sm data-[state=active]:bg-surface-highlight data-[state=active]:text-cyan"
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="rounded-none py-3 text-sm data-[state=active]:bg-surface-highlight data-[state=active]:text-cyan"
              >
                Sign Up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 tracking-wide">
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 tracking-wide">
                    Password
                  </label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary bg-cyan text-void mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Spinner className="mx-auto" /> : "Sign In"}
                </button>

                <p className="text-center text-sm text-text-tertiary mt-2">
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setTab("signup")}
                    className="text-cyan hover:underline bg-transparent border-none cursor-pointer"
                  >
                    Create one
                  </button>
                </p>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 tracking-wide">
                    Full Name
                  </label>
                  <Input
                    type="text"
                    placeholder="Md. Rahim Ahmed"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 tracking-wide">
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 tracking-wide">
                    Password
                  </label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                {/* Role Toggle */}
                <div>
                  <label className="block text-xs text-text-secondary mb-2 tracking-wide">
                    I want to...
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRole(r.value as "buyer" | "seller")}
                        className={`py-3 rounded-xl text-sm font-medium transition-all duration-200 border ${
                          role === r.value
                            ? "bg-cyan text-void border-cyan"
                            : "bg-transparent text-text-secondary border-white/10 hover:border-cyan/30"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Seller-specific: Trade License */}
                {role === "seller" && (
                  <div>
                    <label className="block text-xs text-text-secondary mb-1.5 tracking-wide">
                      Trade License Number
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. TL-2024-987654"
                      value={tradeLicense}
                      onChange={(e) => setTradeLicense(e.target.value)}
                    />
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary bg-cyan text-void mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Spinner className="mx-auto" /> : "Create Account"}
                </button>

                <p className="text-center text-sm text-text-tertiary mt-2">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setTab("signin")}
                    className="text-cyan hover:underline bg-transparent border-none cursor-pointer"
                  >
                    Sign in
                  </button>
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-text-tertiary mt-6">
          By continuing, you agree to our{" "}
          <span className="text-text-secondary hover:text-cyan cursor-pointer">Terms of Service</span>
          {" "}and{" "}
          <span className="text-text-secondary hover:text-cyan cursor-pointer">Privacy Policy</span>.
        </p>
      </div>
    </section>
  );
}