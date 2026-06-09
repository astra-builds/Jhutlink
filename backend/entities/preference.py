# backend/entities/preference.py
# JhutLink — Buyer Preference Entity
# Phase 1 | Entity Layer (built during Phase 2 matching integration)
# Demonstrates: Composition over inheritance (Buyer HAS-A Preference),
#               Hard-filter logic encapsulated on the object that owns the rules,
#               Dynamic field update with validation,
#               "No constraint = no penalty" design principle

from datetime import datetime
from backend.entities.listing import Listing, WasteType, QualityGrade


# ---------------------------------------------------------------------------
# Custom Exception
# ---------------------------------------------------------------------------

class PreferenceFieldError(Exception):
    """
    Raised when update() is called with a field name that does not
    correspond to a valid, updatable preference attribute.

    Design note: using a dedicated exception rather than AttributeError
    means the API layer can catch preference update failures specifically
    without accidentally swallowing unrelated attribute errors from other
    parts of the call stack.
    """
    def __init__(self, field: str, valid_fields: set[str]) -> None:
        self.field        = field
        self.valid_fields = valid_fields
        super().__init__(
            f"'{field}' is not a valid preference field. "
            f"Updatable fields: {sorted(valid_fields)}."
        )


# ---------------------------------------------------------------------------
# Preference Entity
# ---------------------------------------------------------------------------

class Preference:
    """
    Stores a Buyer's matching preferences used by the MatchingEngine to
    surface relevant listings without requiring manual search.

    Design principle — composition over inheritance:
        Preference is not a subclass of Buyer. A Buyer HAS-A Preference.
        This keeps the Buyer class focused on identity and transaction
        behaviour while Preference owns all matching logic. If matching
        rules change, only this class needs to be updated.

    "No constraint = no penalty" rule:
        An empty list for preferred_waste_types means the buyer accepts
        ANY waste type — not that they want nothing. Same for preferred_grades
        and preferred_districts. None for max_quantity_kg and
        max_price_per_kg_taka means no upper limit.
        MatchingEngine awards full points for unconstrained criteria.

    Hard filters (matches_listing) vs soft scores (MatchingEngine.score_listing):
        matches_listing() is a binary gate — a listing either passes or is
        excluded entirely. score_listing() ranks the survivors. This two-pass
        design keeps the scoring function simple: it never needs to handle
        listings that fundamentally don't fit the buyer's needs.
    """

    # Fields that may be updated via update() — defined as a class-level
    # constant so PreferenceFieldError can report valid options accurately
    UPDATABLE_FIELDS: set[str] = {
        "preferred_waste_types",
        "preferred_grades",
        "min_quantity_kg",
        "max_quantity_kg",
        "max_price_per_kg_taka",
        "preferred_districts",
    }

    _id_counter: int = 0

    def __init__(
        self,
        buyer_id:               int,
        preferred_waste_types:  list[WasteType]    = None,
        preferred_grades:       list[QualityGrade] = None,
        min_quantity_kg:        int                = 0,
        max_quantity_kg:        int | None         = None,
        max_price_per_kg_taka: float | None         = None,
        preferred_districts:    list[str]          = None,
    ) -> None:

        Preference._id_counter += 1
        self.preference_id:          int               = Preference._id_counter
        self.buyer_id:               int               = buyer_id

        # Defensive copies — mutable defaults must never be shared across instances
        self.preferred_waste_types:  list[WasteType]   = list(preferred_waste_types or [])
        self.preferred_grades:       list[QualityGrade] = list(preferred_grades or [])
        self.preferred_districts:    list[str]          = list(preferred_districts or [])

        self.min_quantity_kg:        int                = min_quantity_kg
        self.max_quantity_kg:        int | None         = max_quantity_kg
        self.max_price_per_kg_taka: float | None         = max_price_per_kg_taka

        self.updated_at:             datetime           = datetime.utcnow()

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    def update(self, field: str, value) -> None:
        """
        Updates a single preference field by name and re-stamps updated_at.

        Using a dynamic update method (rather than direct attribute assignment)
        means the API layer can pass field/value pairs from a PATCH request
        without needing to know the Preference class's internal structure.
        The validation gate ensures only legitimate fields can be changed.

        Args:
            field: The attribute name to update (must be in UPDATABLE_FIELDS).
            value: The new value for that field.

        Raises:
            PreferenceFieldError: if field is not in UPDATABLE_FIELDS.
        """
        if field not in self.UPDATABLE_FIELDS:
            raise PreferenceFieldError(
                field=field,
                valid_fields=self.UPDATABLE_FIELDS,
            )
        setattr(self, field, value)
        self.updated_at = datetime.utcnow()

    # ------------------------------------------------------------------
    # Hard Filter
    # ------------------------------------------------------------------

    def matches_listing(self, listing: Listing) -> tuple[bool, str]:
        """
        Binary hard filter — determines whether a listing is eligible
        to be scored at all.

        Returns a (passes, reason) tuple:
            passes=True  → listing clears all hard constraints
            passes=False → listing is excluded; reason explains which
                           constraint it failed

        Design note: returning (bool, reason) rather than just bool
        lets the demo and logging layer explain WHY a listing was
        excluded without running the checks a second time.

        All checks follow the "no constraint = no penalty" rule:
        an empty list or None means the constraint is inactive.
        """

        # Waste type check
        if (self.preferred_waste_types
                and listing.waste_type not in self.preferred_waste_types):
            return False, (
                f"Waste type '{listing.waste_type.value}' not in preferred "
                f"types {[w.value for w in self.preferred_waste_types]}."
            )

        # Quality grade check
        if (self.preferred_grades
                and listing.quality_grade not in self.preferred_grades):
            return False, (
                f"Grade '{listing.quality_grade.value}' not in preferred "
                f"grades {[g.value for g in self.preferred_grades]}."
            )

        # Minimum quantity check
        if listing.quantity_kg < self.min_quantity_kg:
            return False, (
                f"Listing quantity {listing.quantity_kg} kg "
                f"is below buyer minimum {self.min_quantity_kg} kg."
            )

        # Maximum quantity check (only if ceiling is set)
        if (self.max_quantity_kg is not None
                and listing.quantity_kg > self.max_quantity_kg):
            return False, (
                f"Listing quantity {listing.quantity_kg} kg "
                f"exceeds buyer maximum {self.max_quantity_kg} kg."
            )

        # Price ceiling check (only if ceiling is set)
        if (self.max_price_per_kg_taka is not None
                and listing.reserve_price_taka > self.max_price_per_kg_taka):
            return False, (
                f"Reserve price ৳{listing.reserve_price_taka:.2f}/kg "
                f"exceeds buyer ceiling "
                f"৳{self.max_price_per_kg_taka:.2f}/kg."
            )

        # District check
        if (self.preferred_districts
                and listing.location_district not in self.preferred_districts):
            return False, (
                f"District '{listing.location_district}' not in preferred "
                f"districts {self.preferred_districts}."
            )

        return True, "All hard filters passed."

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def to_dict(self) -> dict:
        """
        Returns a serialisation-ready dict for the JSON storage layer.
        Enum values are stored as their .value strings so they can be
        restored by load_preferences() using WasteType() / QualityGrade().
        """
        return {
            "preference_id":          self.preference_id,
            "buyer_id":               self.buyer_id,
            "preferred_waste_types":  [w.value for w in self.preferred_waste_types],
            "preferred_grades":       [g.value for g in self.preferred_grades],
            "preferred_districts":    list(self.preferred_districts),
            "min_quantity_kg":        self.min_quantity_kg,
            "max_quantity_kg":        self.max_quantity_kg,
            "max_price_per_kg_taka": self.max_price_per_kg_taka,
            "updated_at":             self.updated_at.isoformat(),
        }

    # ------------------------------------------------------------------
    # Dunder Methods
    # ------------------------------------------------------------------

    def __str__(self) -> str:
        waste_str = (
            ", ".join(w.value for w in self.preferred_waste_types)
            or "Any"
        )
        grade_str = (
            ", ".join(g.value for g in self.preferred_grades)
            or "Any"
        )
        price_str = (
            f"৳{self.max_price_per_kg_taka:.2f}/kg"
            if self.max_price_per_kg_taka
            else "No ceiling"
        )
        qty_str = (
            f"{self.min_quantity_kg}–"
            + (str(self.max_quantity_kg) if self.max_quantity_kg else "∞")
            + " kg"
        )
        district_str = (
            ", ".join(self.preferred_districts) or "Any"
        )
        return (
            f"[PREFERENCE #{self.preference_id}] "
            f"Buyer #{self.buyer_id} | "
            f"Types: {waste_str} | "
            f"Grades: {grade_str} | "
            f"Qty: {qty_str} | "
            f"Max price: {price_str} | "
            f"Districts: {district_str}"
        )

    def __repr__(self) -> str:
        return (
            f"Preference("
            f"preference_id={self.preference_id!r}, "
            f"buyer_id={self.buyer_id!r}, "
            f"waste_types={[w.value for w in self.preferred_waste_types]!r}, "
            f"grades={[g.value for g in self.preferred_grades]!r})"
        )