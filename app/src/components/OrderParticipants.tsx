interface Participant {
  id: number;
  name?: string;
  role: string;
  rating?: number;
  listingCount?: number;
  tradeLicense?: string;
}

interface OrderParticipantsProps {
  buyer: Participant;
  seller: Participant;
}

function ParticipantCard({ participant, label }: { participant: Participant; label: string }) {
  return (
    <div className="flex-1">
      <p className="text-xs text-text-tertiary uppercase tracking-wide mb-2">{label}</p>
      <div className="glass-card p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
            participant.role === "buyer" ? "bg-cyan/20 text-cyan" : "bg-emerald/20 text-emerald"
          }`}>
            {(participant.name || `#${participant.id}`).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-text-primary text-sm truncate">
              {participant.name || `User #${participant.id}`}
            </p>
            <p className="text-xs text-text-tertiary capitalize">{participant.role}</p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5 border-t border-white/[0.04] pt-3">
          {participant.rating !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-tertiary">Rating</span>
              <span className="text-amber-500 font-medium">{participant.rating.toFixed(1)} ★</span>
            </div>
          )}
          {participant.listingCount !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-tertiary">Listings</span>
              <span className="text-text-primary">{participant.listingCount}</span>
            </div>
          )}
          {participant.tradeLicense && (
            <div className="text-xs text-text-tertiary mt-1 truncate" title={participant.tradeLicense}>
              License: {participant.tradeLicense}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OrderParticipants({ buyer, seller }: OrderParticipantsProps) {
  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-text-primary mb-4 uppercase tracking-wide">
        Participants
      </h3>
      <div className="flex flex-col sm:flex-row gap-4">
        <ParticipantCard participant={buyer} label="Buyer" />
        <div className="flex items-center justify-center text-text-tertiary text-xs">
          ⇄
        </div>
        <ParticipantCard participant={seller} label="Seller" />
      </div>
    </div>
  );
}
