import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Listing } from "@/lib/api";
import { formatCurrency, formatKg } from "@/utils/formatting";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

const WASTE_TYPES = ["Cotton", "Polyester", "Mixed", "Denim", "Synthetic Blend"];
const GRADES = ["A", "B", "C"];
const DISTRICTS = ["Dhaka", "Gazipur", "Narayanganj", "Chittagong", "Savar", "Gopalganj", "Mymensingh", "Khulna", "Barishal", "Sylhet", "Rangpur"];

export default function SellerListings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [csvText, setCsvText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    waste_type: "",
    quantity_kg: "",
    reserve_price_taka: "",  // string for form input
    quality_grade: "",
    location_district: "",
    photos: "",
    auction_duration_hours: "72",
  });
  const [creating, setCreating] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);

  useEffect(() => {
    loadListings();
  }, [user]);

  const loadListings = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.listings.list();
      const sellerListings = res.listings.filter(l => l.seller_id === user.id);
      setListings(sellerListings);
    } catch (err) {
      console.error("Failed to load listings:", err);
      setError("Failed to load listings. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!csvText.trim()) { toast.error("Please enter CSV data."); return; }
    try {
      const lines = csvText.trim().split("\n");
      const headers = lines[0].split(",").map(h => h.trim());
      const rows = lines.slice(1).map(line => {
        const vals = line.split(",").map(v => v.trim());
        const row: Record<string, any> = {};
        headers.forEach((h, i) => { row[h] = vals[i]; });
        if (row.photos) row.photos = row.photos.split(";").filter(Boolean);
        else row.photos = [];
        row.quantity_kg = parseInt(row.quantity_kg, 10);
        row.reserve_price_taka = parseFloat(row.reserve_price_taka);
        row.auction_duration_hours = parseInt(row.auction_duration_hours, 10);
        return row;
      });
      const result = await api.listings.bulkCreate(rows);
      toast.success(`${result.total_created} listing(s) created. ${result.total_failed} failed.`);
      setShowBulk(false);
      setCsvText("");
      loadListings();
    } catch (err: any) {
      toast.error(err.detail || "Bulk upload failed.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setCsvText(ev.target?.result as string || ""); };
    reader.readAsText(file);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUri = ev.target?.result as string;
        if (dataUri) setUploadedPhotos(prev => [...prev, dataUri]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeUploadedPhoto = (index: number) => {
    setUploadedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setCreating(true);
    setError("");
    try {
      const urlPhotos = formData.photos
        ? formData.photos.split(",").map(s => s.trim()).filter(Boolean)
        : [];
      const photos = [...uploadedPhotos, ...urlPhotos];

      await api.listings.create({
        waste_type: formData.waste_type,
        quantity_kg: parseInt(formData.quantity_kg, 10),
        reserve_price_taka: parseFloat(formData.reserve_price_taka),
        quality_grade: formData.quality_grade,
        location_district: formData.location_district,
        photos,
        auction_duration_hours: parseInt(formData.auction_duration_hours, 10),
      });

      toast.success("Listing created successfully!");
      setShowCreate(false);
      setUploadedPhotos([]);
      setFormData({
        waste_type: "", quantity_kg: "", reserve_price_taka: "",
        quality_grade: "", location_district: "", photos: "",
        auction_duration_hours: "72",
      });
      loadListings();
    } catch (err: any) {
      console.error("Failed to create listing:", err);
      setError(err.detail || "Failed to create listing.");
    } finally {
      setCreating(false);
    }
  };

  if (loading && listings.length === 0) {
    return (
      <div className="flex h-[100dvh] bg-void">
        <DashboardSidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Spinner className="size-8" />
            <p className="ml-4 text-text-secondary">Loading listings...</p>
          </div>
        </main>
      </div>
    );
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "ACTIVE": return "text-cyan";
      case "CLOSED": return "text-amber-500";
      case "SOLD": return "text-emerald";
      case "EXPIRED": return "text-text-tertiary";
      default: return "text-text-secondary";
    }
  };

  return (
    <div className="flex h-[100dvh] bg-void">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col">
        <div className="bg-base-elevated border-b border-white/[0.04] px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-text-primary">Market Listings</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowBulk(!showBulk)}
              className="btn-primary border border-cyan/50 text-cyan px-4 py-2 hover:bg-cyan/10"
            >
              Bulk Upload CSV
            </button>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="btn-primary bg-cyan text-void px-4 py-2 hover:bg-cyan/80"
            >
              {showCreate ? "Cancel" : "+ New Listing"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {showBulk && (
            <div className="glass-card p-6 mb-6 space-y-4">
              <h2 className="text-lg font-medium text-text-primary">Bulk Upload CSV</h2>
              <p className="text-xs text-text-tertiary">
                CSV format: waste_type,quantity_kg,reserve_price_taka,quality_grade,location_district,photos,auction_duration_hours
              </p>
              <textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={`Cotton,500,2500,A,Dhaka,photo1.jpg;photo2.jpg,48\nPolyester,300,1800,B,Gazipur,photo3.jpg,72`}
                rows={6}
                className="w-full p-2 border border-white/10 rounded-md bg-surface/20 focus:border-cyan/50 focus:outline-none text-sm font-mono"
              />
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-cyan hover:underline bg-transparent border-none cursor-pointer"
                >
                  Upload .csv file
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleBulkUpload}
                  className="btn-primary bg-cyan text-void px-4 py-2"
                >
                  Upload
                </button>
              </div>
            </div>
          )}

          {showCreate && (
            <form onSubmit={handleCreate} className="glass-card p-6 mb-6 space-y-4">
              <h2 className="text-lg font-medium text-text-primary">Create New Listing</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-tertiary mb-1">Waste Type</label>
                  <select
                    value={formData.waste_type}
                    onChange={e => setFormData({ ...formData, waste_type: e.target.value })}
                    required
                    className="w-full p-2 border border-white/10 rounded-md bg-surface/20 focus:border-cyan/50 focus:outline-none text-sm"
                  >
                    <option value="">Select type</option>
                    {WASTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-text-tertiary mb-1">Quality Grade</label>
                  <select
                    value={formData.quality_grade}
                    onChange={e => setFormData({ ...formData, quality_grade: e.target.value })}
                    required
                    className="w-full p-2 border border-white/10 rounded-md bg-surface/20 focus:border-cyan/50 focus:outline-none text-sm"
                  >
                    <option value="">Select grade</option>
                    {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-text-tertiary mb-1">Quantity (kg)</label>
                  <input
                    type="number"
                    placeholder="e.g. 500"
                    value={formData.quantity_kg}
                    onChange={e => setFormData({ ...formData, quantity_kg: e.target.value })}
                    required
                    min="50"
                    className="w-full p-2 border border-white/10 rounded-md bg-surface/20 focus:border-cyan/50 focus:outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-text-tertiary mb-1">Reserve Price (BDT/kg)</label>
                  <input
                    type="number"
                    placeholder="e.g. 25.00"
                    value={formData.reserve_price_taka}
                    onChange={e => setFormData({ ...formData, reserve_price_taka: e.target.value })}
                    required
                    step="0.01"
                    min="0.01"
                    className="w-full p-2 border border-white/10 rounded-md bg-surface/20 focus:border-cyan/50 focus:outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-text-tertiary mb-1">District</label>
                  <select
                    value={formData.location_district}
                    onChange={e => setFormData({ ...formData, location_district: e.target.value })}
                    required
                    className="w-full p-2 border border-white/10 rounded-md bg-surface/20 focus:border-cyan/50 focus:outline-none text-sm"
                  >
                    <option value="">Select district</option>
                    {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-text-tertiary mb-1">Auction Duration (hours)</label>
                  <select
                    value={formData.auction_duration_hours}
                    onChange={e => setFormData({ ...formData, auction_duration_hours: e.target.value })}
                    required
                    className="w-full p-2 border border-white/10 rounded-md bg-surface/20 focus:border-cyan/50 focus:outline-none text-sm"
                  >
                    <option value="24">24 hours</option>
                    <option value="48">48 hours</option>
                    <option value="72">72 hours</option>
                  </select>
                </div>

                <div className="md:col-span-2 space-y-3">
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1">Upload Photos</label>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="btn-primary border border-dashed border-cyan/50 text-cyan px-4 py-2 hover:bg-cyan/10 text-xs"
                      >
                        + Choose Images
                      </button>
                      {uploadedPhotos.length > 0 && (
                        <span className="text-xs text-text-tertiary">{uploadedPhotos.length} file(s) selected</span>
                      )}
                    </div>
                    {uploadedPhotos.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {uploadedPhotos.map((dataUri, i) => (
                          <div key={i} className="relative group">
                            <img
                              src={dataUri}
                              alt={`Upload ${i + 1}`}
                              className="w-16 h-16 object-cover rounded-md border border-white/[0.06]"
                            />
                            <button
                              type="button"
                              onClick={() => removeUploadedPhoto(i)}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[0.6rem] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border-none cursor-pointer"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1">Or paste photo URLs (comma separated)</label>
                    <input
                      type="text"
                      placeholder="https://example.com/photo1.jpg, https://example.com/photo2.jpg"
                      value={formData.photos}
                      onChange={e => setFormData({ ...formData, photos: e.target.value })}
                      className="w-full p-2 border border-white/10 rounded-md bg-surface/20 focus:border-cyan/50 focus:outline-none text-sm"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={creating}
                  className="btn-primary bg-cyan text-void px-6 py-2 disabled:opacity-50"
                >
                  {creating ? <Spinner className="size-4" /> : "Create Listing"}
                </button>
              </div>
            </form>
          )}

          {listings.length === 0 && !showCreate ? (
            <div className="text-center py-12">
              <p className="text-text-tertiary">You haven't created any listings yet.</p>
              <p className="text-sm text-text-tertiary mb-4">
                Create your first listing to start selling textile waste.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="btn-primary bg-cyan text-void"
              >
                Create Listing
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {listings.map((listing) => (
                <div key={listing.listing_id} className="glass-card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-text-primary">
                        {listing.waste_type}
                      </h3>
                      <p className="text-text-tertiary text-sm">
                        Grade {listing.quality_grade} • {formatKg(listing.quantity_kg)}
                        {listing.location_district && <span> • {listing.location_district}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        listing.status === "ACTIVE" ? "text-cyan bg-cyan/10" :
                        listing.status === "SOLD" ? "text-emerald bg-emerald/10" :
                        listing.status === "CLOSED" ? "text-amber-500 bg-amber-500/10" :
                        listing.status === "EXPIRED" ? "text-text-tertiary bg-text-tertiary/10" :
                        "text-text-secondary bg-text-secondary/10"
                      }`}>
                        {listing.status}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-white/[0.04] pt-3 mt-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-text-tertiary">
                          Reserve: {formatCurrency(listing.reserve_price_taka)}/kg
                        </p>
                        <p className="text-xs text-text-tertiary">
                          Created: {new Date(listing.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Link
                        to={`/listings/${listing.listing_id}`}
                        className="text-xs text-cyan hover:underline"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
