import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

const WASTE_TYPES = ["Cotton", "Polyester", "Mixed", "Denim", "Synthetic Blend"];
const GRADES = ["A", "B", "C"];
const DISTRICTS = ["Dhaka", "Gazipur", "Narayanganj", "Chittagong", "Savar", "Gopalganj", "Mymensingh", "Khulna", "Barishal", "Sylhet", "Rangpur", "Mymensingh"];
const TIERS = ["Micro", "Mid", "Enterprise"];

export default function BuyerPreferences() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form state
  const [preferredWasteTypes, setPreferredWasteTypes] = useState([]);
  const [preferredGrades, setPreferredGrades] = useState([]);
  const [preferredDistricts, setPreferredDistricts] = useState([]);
  const [minQuantity, setMinQuantity] = useState("");
  const [maxQuantity, setMaxQuantity] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  useEffect(() => {
    const loadPreferences = async () => {
      if (!user) return;
      
      setLoading(true);
      setError("");
      try {
        const res = await api.recommendations.getPreferences();
        setPreferences(res);
        
        // Populate form with existing preferences
        if (res) {
          setPreferredWasteTypes(res.preferred_waste_types || []);
          setPreferredGrades(res.preferred_grades || []);
          setPreferredDistricts(res.preferred_districts || []);
          setMinQuantity(res.min_quantity_kg?.toString() || "");
          setMaxQuantity(res.max_quantity_kg?.toString() || "");
          setMaxPrice(res.max_price_per_kg_taka ? res.max_price_per_kg_taka.toFixed(2) : "");
        }
      } catch (err: any) {
        console.error("Failed to load preferences:", err);
        // 404 means no preferences set yet, which is OK
        if (err.status !== 404) {
          setError("Failed to load preferences. Please try again later.");
        }
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    setError("");
    try {
      const payload = {
        preferred_waste_types: preferredWasteTypes,
        preferred_grades: preferredGrades,
        preferred_districts: preferredDistricts,
        min_quantity_kg: minQuantity ? parseInt(minQuantity, 10) : undefined,
        max_quantity_kg: maxQuantity ? parseInt(maxQuantity, 10) : undefined,
        max_price_per_kg_taka: maxPrice ? parseFloat(maxPrice) : undefined,
      };
      
      await api.recommendations.setPreferences(payload);
      setPreferences(await api.recommendations.getPreferences());
      toast.success("Preferences saved successfully!");
    } catch (err: any) {
      console.error("Failed to save preferences:", err);
      setError(err.detail || "Failed to save preferences. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[100dvh] bg-void">
        <DashboardSidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Spinner className="size-8" />
            <p className="ml-4 text-text-secondary">Loading preferences...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error && !loading) {
    return (
      <div className="flex h-[100dvh] bg-void">
        <DashboardSidebar />
        <main className="flex-1 flex items-center justify-center text-center py-12">
          <div className="glass-card p-8 max-w-md">
            <p className="text-text-tertiary">{error}</p>
            <div className="mt-6 flex justify-center">
              <Link to="/dashboard/buyer" className="text-cyan hover:underline">
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-void">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col">
        <div className="bg-base-elevated border-b border-white/[0.04] px-6 py-4">
          <h1 className="text-xl font-semibold text-text-primary">Sourcing Preferences</h1>
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {/* Waste Types */}
              <div>
                <p className="font-medium text-text-primary mb-2">
                  Preferred Waste Types
                </p>
                <p className="text-xs text-text-tertiary mb-2">
                  Select the types of textile waste you're interested in purchasing
                </p>
                <div className="flex flex-wrap gap-2">
                  {WASTE_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={preferredWasteTypes.includes(type)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPreferredWasteTypes([...preferredWasteTypes, type]);
                          } else {
                            setPreferredWasteTypes(preferredWasteTypes.filter(t => t !== type));
                          }
                        }}
                        className="accent-cyan w-4 h-4"
                      />
                      <span className="text-sm">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Grades */}
              <div>
                <p className="font-medium text-text-primary mb-2">
                  Preferred Quality Grades
                </p>
                <p className="text-xs text-text-tertiary mb-2">
                  Select the quality grades you accept
                </p>
                <div className="flex flex-wrap gap-2">
                  {GRADES.map((grade) => (
                    <label key={grade} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={preferredGrades.includes(grade)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPreferredGrades([...preferredGrades, grade]);
                          } else {
                            setPreferredGrades(preferredGrades.filter(g => g !== grade));
                          }
                        }}
                        className="accent-cyan w-4 h-4"
                      />
                      <span className="text-sm">Grade {grade}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Districts */}
              <div>
                <p className="font-medium text-text-primary mb-2">
                  Preferred Locations
                </p>
                <p className="text-xs text-text-tertiary mb-2">
                  Select districts where you prefer to source from
                </p>
                <div className="flex flex-wrap gap-2">
                  {DISTRICTS.map((district) => (
                    <label key={district} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={preferredDistricts.includes(district)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPreferredDistricts([...preferredDistricts, district]);
                          } else {
                            setPreferredDistricts(preferredDistricts.filter(d => d !== district));
                          }
                        }}
                        className="accent-cyan w-4 h-4"
                      />
                      <span className="text-xs">{district}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Quantity Controls */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="font-medium text-text-primary mb-2">
                    Minimum Quantity (kg)
                  </p>
                  <input
                    type="number"
                    placeholder="e.g. 50"
                    value={minQuantity}
                    onChange={(e) => setMinQuantity(e.target.value)}
                    min="50"
                    className="w-full p-2 border border-white/10 rounded-md bg-surface/20 focus:border-cyan/50 focus:outline-none text-sm"
                  />
                  <p className="text-xs text-text-tertiary mt-1">
                    Minimum order quantity you're willing to purchase
                  </p>
                </div>
                <div>
                  <p className="font-medium text-text-primary mb-2">
                    Maximum Quantity (kg)
                  </p>
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    value={maxQuantity}
                    onChange={(e) => setMaxQuantity(e.target.value)}
                    min="50"
                    className="w-full p-2 border border-white/10 rounded-md bg-surface/20 focus:border-cyan/50 focus:outline-none text-sm"
                  />
                  <p className="text-xs text-text-tertiary mt-1">
                    Maximum order quantity you're willing to purchase (optional)
                  </p>
                </div>
              </div>

              {/* Price Control */}
              <div>
                <p className="font-medium text-text-primary mb-2">
                  Maximum Price per KG (৳)
                </p>
                <input
                  type="number"
                  placeholder="e.g. 25.00"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  step="0.01"
                  min="0"
                  className="w-full p-2 border border-white/10 rounded-md bg-surface/20 focus:border-cyan/50 focus:outline-none text-sm"
                />
                <p className="text-xs text-text-tertiary mt-1">
                  Maximum price per kilogram you're willing to pay (optional)
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full md:w-auto btn-primary bg-cyan text-void px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Spinner className="size-4 mr-2" /> : "Save Preferences"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}