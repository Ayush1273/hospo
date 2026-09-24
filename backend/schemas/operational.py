"""
Pydantic models for operational inputs and hospital state.
"""

from pydantic import BaseModel, Field


class OperationalInput(BaseModel):
    # Column 1
    er_arrivals: int = Field(default=42, ge=0, description="Emergency Room Arrivals")
    ambulance_arrivals: int = Field(
        default=11, ge=0, description="Ambulance Deliveries"
    )
    general_admissions: int = Field(
        default=30, ge=0, description="General Inpatient Admissions"
    )
    icu_admissions: int = Field(default=8, ge=0, description="Direct ICU Admissions")

    # Column 2
    icu_discharges: int = Field(default=5, ge=0, description="ICU Discharges")
    icu_transfers_in: int = Field(default=5, ge=0, description="ICU Transfers In")
    icu_transfers_out: int = Field(default=2, ge=0, description="ICU Transfers Out")
    icu_occupied_beds: int = Field(default=43, ge=0, description="ICU Occupied Beds")

    # Column 3
    icu_available_beds: int = Field(default=5, ge=0, description="ICU Available Beds")
    hdu_occupied_beds: int = Field(
        default=4, ge=0, description="High Dependency Unit Occupied Beds"
    )
    general_occupied_beds: int = Field(
        default=3, ge=0, description="General Ward Occupied Beds"
    )
    private_occupied_beds: int = Field(
        default=6, ge=0, description="Private Ward Occupied Beds"
    )

    # Column 4
    ventilators_in_use: int = Field(
        default=2, ge=0, description="Ventilators currently deployed"
    )
    ventilators_available: int = Field(
        default=1, ge=0, description="Ventilators in reserve/available"
    )
    icu_staff_available: int = Field(default=12, ge=0, description="ICU Staff on duty")
    staff_shortage: str = Field(
        default="YES", description="Staff shortage flag: YES or NO"
    )
    elective_surgeries: int = Field(
        default=3, ge=0, description="Scheduled elective surgeries"
    )


class HospitalState(BaseModel):
    icu_beds_available: int
    ventilators_available: int
    icu_staff_available: int
    staff_shortage: str


class HospitalObservation(BaseModel):
    timestamp: str
    icu_occupied_beds: int
    icu_available_beds: int
    icu_occupancy_pct: float
    hdu_occupied_beds: int
    general_occupied_beds: int
    private_occupied_beds: int
    total_occupied_beds: int
    hospital_occupancy_pct: float
    ventilators_in_use: int
    ventilators_available: int
    icu_staff_available: int
    staff_shortage_flag: int
    staff_shortage: str
    elective_surgeries: int
    er_arrivals: int
    ambulance_arrivals: int
    general_admissions: int
    icu_admissions: int
    icu_discharges: int
    icu_transfers_in: int
    icu_transfers_out: int


class HMSFileSummary(BaseModel):
    filename: str
    is_default: bool
    total_records: int
    earliest_timestamp: str
    latest_timestamp: str
    hours_covered: int
    is_valid_72h: bool
    latest_observation: HospitalObservation
