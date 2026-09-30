from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List, Dict
import os
from app.database.session import get_db
from app.core.security import get_current_vendor
from app.schemas.new_orders import (
    OnewayQuoteRequest,
    OnewayQuoteResponse,
    OnewayConfirmRequest,
    OnewayConfirmResponse,
    RoundTripQuoteRequest,
    RoundTripConfirmRequest,
    MulticityQuoteRequest,
    MulticityConfirmRequest,
    FareBreakdown,NewOrderResponse,RecreateOrderRequest,
    OrderType,
)
from app.crud.new_orders import calculate_oneway_fare, calculate_multisegment_fare, create_oneway_order, get_pending_all_city_orders, get_orders_by_vendor_id, apply_distance_override, _origin_and_destination_from_index_map
from app.crud.order_assignments import get_vendor_orders_with_assignments
from app.schemas.order_assignments import OrderAssignmentWithOrderDetails
from app.models.new_orders import OrderTypeEnum, CarTypeEnum
from app.schemas.baseorder import BaseOrderSchema
from app.crud.orders import get_vendor_orders, recreate_order


from app.core.security import get_current_admin, get_current_user_flexible, get_current_driver
router = APIRouter()
admin_commession_env = os.getenv("ADMIN_COMMESSION_ENV")

@router.post("/oneway/quote", response_model=OnewayQuoteResponse, dependencies=[Depends(get_current_user_flexible)])
def oneway_quote(payload: OnewayQuoteRequest):
    try:
        fare = calculate_oneway_fare(
            payload.pickup_drop_location,
            payload.cost_per_km,
            payload.driver_allowance,
            payload.extra_driver_allowance,
            payload.permit_charges,
            payload.extra_permit_charges,
            payload.hill_charges,
            payload.toll_charges,
            payload.extra_cost_per_km,
            payload.night_charges,
            payload.trip_type
        )
        return OnewayQuoteResponse(
            fare=FareBreakdown(**fare),
            echo=payload,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to calculate fare: {str(e)}",
        )


@router.post("/oneway/confirm", response_model=OnewayConfirmResponse, status_code=status.HTTP_201_CREATED)
def oneway_confirm(
    payload: OnewayConfirmRequest,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    try:
        # Only vendor from auth can create the order
        vendor_id = current_vendor.id

        if payload.trip_type not in (OrderType.ONEWAY, OrderType.LOCAL):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Use the matching endpoint for this trip type (roundtrip/confirm, multicity/confirm, or hourly-rental)",
            )
        if payload.trip_type == OrderType.LOCAL:
            from app.utils.serviceable_cities import is_city_serviceable
            origin_city, _ = _origin_and_destination_from_index_map(payload.pickup_drop_location)
            if not is_city_serviceable(db, origin_city):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Local Bookings aren't enabled for {origin_city} yet",
                )

        # Validate send_to / near_city / target_driver_id
        if payload.send_to == "NEAR_CITY" and not payload.near_city:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="near_city is required when send_to is NEAR_CITY",
            )
        if payload.send_to == "DRIVER" and not payload.target_driver_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_driver_id is required when send_to is DRIVER",
            )
        # Normalize to list for storage
        if payload.send_to == "NEAR_CITY":
            if isinstance(payload.near_city, list):
                pick_near_city = [str(c) for c in payload.near_city if str(c).strip()]
            else:
                pick_near_city = [str(payload.near_city)]
        else:
            # DRIVER-targeted orders don't use city broadcast, but still need
            # a valid pick_near_city value for the column (unused for notify).
            pick_near_city = ["ALL"]
        target_driver_id = payload.target_driver_id if payload.send_to == "DRIVER" else None

        fare = calculate_oneway_fare(
            payload.pickup_drop_location,
            payload.cost_per_km,
            payload.driver_allowance,
            payload.extra_driver_allowance,
            payload.permit_charges,
            payload.extra_permit_charges,
            payload.hill_charges,
            payload.toll_charges,
            payload.extra_cost_per_km,
            payload.night_charges,
            payload.trip_type

        )
        # Quote-review distance override: booking-only, never touches the
        # route_distances cache (that only happens inside get_distance_km_
        # between_locations, already called above).
        distance_edited = False
        if payload.override_km is not None and round(payload.override_km) != round(fare["total_km"]):
            fare = apply_distance_override(
                fare, payload.override_km, payload.override_trip_time,
                payload.cost_per_km, payload.extra_cost_per_km,
            )
            distance_edited = True
        print(fare)
        # Persist order
        new_order, master_order_id = create_oneway_order(
            db,
            vendor_id=vendor_id,
            trip_type=OrderTypeEnum(payload.trip_type.value),
            car_type=CarTypeEnum(payload.car_type),
            location_links=payload.location_links,
            pickup_drop_location=payload.pickup_drop_location,
            start_date_time=payload.start_date_time,
            customer_name=payload.customer_name,
            customer_number=payload.customer_number,
            cost_per_km=payload.cost_per_km,
            extra_cost_per_km=payload.extra_cost_per_km,
            driver_allowance=payload.driver_allowance,
            extra_driver_allowance=payload.extra_driver_allowance,
            permit_charges=payload.permit_charges,
            extra_permit_charges=payload.extra_permit_charges,
            hill_charges=payload.hill_charges,
            toll_charges=payload.toll_charges,
            pickup_notes=payload.pickup_notes or "",
            trip_distance = fare["total_km"],
            trip_time = fare["trip_time"],
            platform_fees_percent = admin_commession_env,
            pick_near_city=pick_near_city,
            target_driver_id=target_driver_id,
            max_time_to_assign_order=payload.max_time_to_assign_order,
            toll_charge_update=payload.toll_charge_update,
            night_charges=payload.night_charges if hasattr(payload, 'night_charges') else None,
            acceptance_deadline=getattr(payload, 'acceptance_deadline', None),
            estimated_cal_price = fare["driver_amount"],
            vendor_cal_price = fare["customer_amount"],
            distance_edited = distance_edited,
            calculated_trip_distance = fare.get("calculated_km"),
            car_make_year_requirement=payload.car_make_year_requirement,
            carrier_required=bool(payload.carrier_required),
            priority_for_paid=bool(payload.priority_for_paid) if payload.priority_for_paid is not None else True,
            priority_cutoff_at=payload.priority_cutoff_at,
            fare_type=payload.fare_type or "ITEMIZED",
            charge_items=[item.model_dump() for item in payload.charge_items] if payload.charge_items else None,
            advance_received=payload.advance_received,
            total_booking_amount=payload.total_booking_amount,
            extra_amount=payload.extra_amount,
            waiting_hours_included=payload.waiting_hours_included,
            # "10% CC" toggle (2026-09-04) - see crud/end_records.py's
            # update_end_trip_record for where this actually skips taking
            # admin_profit at trip close.
            commission_waived=not payload.apply_commission,
        )
        print(fare)

        return OnewayConfirmResponse(
            order_id=master_order_id,  # Return master order ID instead of new_order.order_id
            trip_status=new_order.trip_status,
            # pick_near_city=",".join(new_order.pick_near_city) if isinstance(new_order.pick_near_city, list) else str(new_order.pick_near_city),
            pick_near_city=(
                new_order.pick_near_city
                if isinstance(new_order.pick_near_city, list)
                else [new_order.pick_near_city]  # convert single string into list
            ),
            trip_type = new_order.trip_type,
            fare=FareBreakdown(**fare),
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"CONFIRM_ORDER_ERROR: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to confirm order: {str(e)}",
        )


@router.post("/roundtrip/quote", response_model=OnewayQuoteResponse, dependencies=[Depends(get_current_user_flexible)])
def roundtrip_quote(payload: RoundTripQuoteRequest):
    try:
        fare = calculate_multisegment_fare(
            payload.pickup_drop_location,
            payload.cost_per_km,
            payload.driver_allowance,
            payload.extra_driver_allowance,
            payload.permit_charges,
            payload.extra_permit_charges,
            payload.hill_charges,
            payload.toll_charges,
            payload.extra_cost_per_km,
            payload.night_charges,
            payload.trip_type,
            start_date_time=payload.start_date_time,
            end_date_time=payload.end_date_time,
        )
        return OnewayQuoteResponse(
            fare=FareBreakdown(**fare),
            echo=payload,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to calculate fare: {str(e)}",
        )


@router.post("/roundtrip/confirm", response_model=OnewayConfirmResponse, status_code=status.HTTP_201_CREATED)
def roundtrip_confirm(
    payload: RoundTripConfirmRequest,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    try:
        vendor_id = current_vendor.id
        if payload.send_to == "NEAR_CITY" and not payload.near_city:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="near_city is required when send_to is NEAR_CITY",
            )
        if payload.send_to == "DRIVER" and not payload.target_driver_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_driver_id is required when send_to is DRIVER",
            )
        if payload.send_to == "NEAR_CITY":
            if isinstance(payload.near_city, list):
                pick_near_city = [str(c) for c in payload.near_city if str(c).strip()]
            else:
                pick_near_city = [str(payload.near_city)]
        else:
            pick_near_city = ["ALL"]
        target_driver_id = payload.target_driver_id if payload.send_to == "DRIVER" else None

        fare = calculate_multisegment_fare(
            payload.pickup_drop_location,
            payload.cost_per_km,
            payload.driver_allowance,
            payload.extra_driver_allowance,
            payload.permit_charges,
            payload.extra_permit_charges,
            payload.hill_charges,
            payload.toll_charges,
            payload.extra_cost_per_km,
            payload.night_charges,
            payload.trip_type,
            start_date_time=payload.start_date_time,
            end_date_time=payload.end_date_time,
        )
        distance_edited = False
        if payload.override_km is not None and round(payload.override_km) != round(fare["total_km"]):
            fare = apply_distance_override(
                fare, payload.override_km, payload.override_trip_time,
                payload.cost_per_km, payload.extra_cost_per_km,
            )
            distance_edited = True

        new_order, master_order_id = create_oneway_order(
            db,
            vendor_id=vendor_id,
            trip_type=OrderTypeEnum.ROUND_TRIP,
            car_type=CarTypeEnum(payload.car_type),
            location_links=payload.location_links,
            pickup_drop_location=payload.pickup_drop_location,
            start_date_time=payload.start_date_time,
            end_date_time=payload.end_date_time,
            customer_name=payload.customer_name,
            customer_number=payload.customer_number,
            cost_per_km=payload.cost_per_km,
            extra_cost_per_km=payload.extra_cost_per_km,
            driver_allowance=payload.driver_allowance,
            extra_driver_allowance=payload.extra_driver_allowance,
            permit_charges=payload.permit_charges,
            extra_permit_charges=payload.extra_permit_charges,
            hill_charges=payload.hill_charges,
            toll_charges=payload.toll_charges,
            pickup_notes=payload.pickup_notes or "",
            trip_distance = fare["total_km"],
            trip_time = fare["trip_time"],
            platform_fees_percent = 10,
            pick_near_city=pick_near_city,
            target_driver_id=target_driver_id,
            max_time_to_assign_order=payload.max_time_to_assign_order,
            toll_charge_update=payload.toll_charge_update,
            night_charges=payload.night_charges if hasattr(payload, 'night_charges') else None,
            acceptance_deadline=getattr(payload, 'acceptance_deadline', None),
            estimated_cal_price = fare["driver_amount"],
            vendor_cal_price = fare["customer_amount"],
            distance_edited = distance_edited,
            calculated_trip_distance = fare.get("calculated_km"),
            car_make_year_requirement=payload.car_make_year_requirement,
            carrier_required=bool(payload.carrier_required),
            priority_for_paid=bool(payload.priority_for_paid) if payload.priority_for_paid is not None else True,
            priority_cutoff_at=payload.priority_cutoff_at,
            fare_type=payload.fare_type or "ITEMIZED",
            charge_items=[item.model_dump() for item in payload.charge_items] if payload.charge_items else None,
            advance_received=payload.advance_received,
            total_booking_amount=payload.total_booking_amount,
            extra_amount=payload.extra_amount,
            waiting_hours_included=payload.waiting_hours_included,
            # "10% CC" toggle (2026-09-04) - see crud/end_records.py's
            # update_end_trip_record for where this actually skips taking
            # admin_profit at trip close.
            commission_waived=not payload.apply_commission,
        )

        return OnewayConfirmResponse(
            order_id=master_order_id,  # Return master order ID instead of new_order.order_id
            trip_status=new_order.trip_status,
            # pick_near_city=",".join(new_order.pick_near_city) if isinstance(new_order.pick_near_city, list) else str(new_order.pick_near_city),
            pick_near_city=(
                new_order.pick_near_city
                if isinstance(new_order.pick_near_city, list)
                else [new_order.pick_near_city]  # convert single string into list
            ),
            trip_type = new_order.trip_type,
            fare=FareBreakdown(**fare),
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"CONFIRM_ORDER_ERROR: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to confirm order: {str(e)}",
        )


@router.post("/multicity/quote", response_model=OnewayQuoteResponse, dependencies=[Depends(get_current_user_flexible)])
def multicity_quote(payload: MulticityQuoteRequest):
    try:
        fare = calculate_multisegment_fare(
            payload.pickup_drop_location,
            payload.cost_per_km,
            payload.driver_allowance,
            payload.extra_driver_allowance,
            payload.permit_charges,
            payload.extra_permit_charges,
            payload.hill_charges,
            payload.toll_charges,
            payload.extra_cost_per_km,
            payload.night_charges,
            payload.trip_type,
            start_date_time=payload.start_date_time,
            end_date_time=payload.end_date_time,
        )
        return OnewayQuoteResponse(
            fare=FareBreakdown(**fare),
            echo=payload,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to calculate fare: {str(e)}",
        )


@router.post("/multicity/confirm", response_model=OnewayConfirmResponse, status_code=status.HTTP_201_CREATED)
def multicity_confirm(
    payload: MulticityConfirmRequest,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    try:
        vendor_id = current_vendor.id
        if payload.send_to == "NEAR_CITY" and not payload.near_city:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="near_city is required when send_to is NEAR_CITY",
            )
        if payload.send_to == "DRIVER" and not payload.target_driver_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_driver_id is required when send_to is DRIVER",
            )
        if payload.send_to == "NEAR_CITY":
            if isinstance(payload.near_city, list):
                pick_near_city = [str(c) for c in payload.near_city if str(c).strip()]
            else:
                pick_near_city = [str(payload.near_city)]
        else:
            pick_near_city = ["ALL"]
        target_driver_id = payload.target_driver_id if payload.send_to == "DRIVER" else None

        fare = calculate_multisegment_fare(
            payload.pickup_drop_location,
            payload.cost_per_km,
            payload.driver_allowance,
            payload.extra_driver_allowance,
            payload.permit_charges,
            payload.extra_permit_charges,
            payload.hill_charges,
            payload.toll_charges,
            payload.extra_cost_per_km,
            payload.night_charges,
            payload.trip_type,
            start_date_time=payload.start_date_time,
            end_date_time=payload.end_date_time,
        )
        distance_edited = False
        if payload.override_km is not None and round(payload.override_km) != round(fare["total_km"]):
            fare = apply_distance_override(
                fare, payload.override_km, payload.override_trip_time,
                payload.cost_per_km, payload.extra_cost_per_km,
            )
            distance_edited = True

        new_order, master_order_id = create_oneway_order(
            db,
            vendor_id=vendor_id,
            trip_type=OrderTypeEnum.MULTY_CITY,
            car_type=CarTypeEnum(payload.car_type),
            location_links=payload.location_links,
            pickup_drop_location=payload.pickup_drop_location,
            start_date_time=payload.start_date_time,
            end_date_time=payload.end_date_time,
            customer_name=payload.customer_name,
            customer_number=payload.customer_number,
            cost_per_km=payload.cost_per_km,
            extra_cost_per_km=payload.extra_cost_per_km,
            driver_allowance=payload.driver_allowance,
            extra_driver_allowance=payload.extra_driver_allowance,
            permit_charges=payload.permit_charges,
            extra_permit_charges=payload.extra_permit_charges,
            hill_charges=payload.hill_charges,
            toll_charges=payload.toll_charges,
            pickup_notes=payload.pickup_notes or "",
            trip_distance = fare["total_km"],
            trip_time = fare["trip_time"],
            platform_fees_percent = 10,
            pick_near_city=pick_near_city,
            target_driver_id=target_driver_id,
            max_time_to_assign_order=payload.max_time_to_assign_order,
            toll_charge_update=payload.toll_charge_update,
            night_charges=payload.night_charges if hasattr(payload, 'night_charges') else None,
            acceptance_deadline=getattr(payload, 'acceptance_deadline', None),
            estimated_cal_price = fare["driver_amount"],
            vendor_cal_price = fare["customer_amount"],
            distance_edited = distance_edited,
            calculated_trip_distance = fare.get("calculated_km"),
            car_make_year_requirement=payload.car_make_year_requirement,
            carrier_required=bool(payload.carrier_required),
            priority_for_paid=bool(payload.priority_for_paid) if payload.priority_for_paid is not None else True,
            priority_cutoff_at=payload.priority_cutoff_at,
            fare_type=payload.fare_type or "ITEMIZED",
            charge_items=[item.model_dump() for item in payload.charge_items] if payload.charge_items else None,
            advance_received=payload.advance_received,
            total_booking_amount=payload.total_booking_amount,
            extra_amount=payload.extra_amount,
            waiting_hours_included=payload.waiting_hours_included,
            # "10% CC" toggle (2026-09-04) - see crud/end_records.py's
            # update_end_trip_record for where this actually skips taking
            # admin_profit at trip close.
            commission_waived=not payload.apply_commission,
        )

        return OnewayConfirmResponse(
            order_id=master_order_id,  # Return master order ID instead of new_order.order_id
            trip_status=new_order.trip_status,
            # pick_near_city=",".join(new_order.pick_near_city) if isinstance(new_order.pick_near_city, list) else str(new_order.pick_near_city),
            pick_near_city=(
                new_order.pick_near_city
                if isinstance(new_order.pick_near_city, list)
                else [new_order.pick_near_city]  # convert single string into list
            ),
            trip_type = new_order.trip_type,
            fare=FareBreakdown(**fare),
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"CONFIRM_ORDER_ERROR: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to confirm order: {str(e)}",
        )

@router.get("/pending-all", response_model=List[NewOrderResponse], dependencies=[Depends(get_current_admin)])
def get_pending_all_orders(db: Session = Depends(get_db)):
    return get_pending_all_city_orders(db)

@router.get("/vendor", response_model=List[BaseOrderSchema])
def get_vendor_orderss(
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor)
):
    print("checks 2")
    return get_vendor_orders(db, current_vendor.id)


@router.get("/vendor/with-assignments", response_model=List[OrderAssignmentWithOrderDetails])
def get_vendor_orders_with_assignmentss(
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor)
):
    """Get all orders for the authenticated vendor with their latest assignment details"""
    print("current_vendor", current_vendor.id)
    return get_vendor_orders_with_assignments(db, str(current_vendor.id))


@router.post("/recreate", status_code=status.HTTP_201_CREATED)
def recreate_order_endpoint(
    payload: RecreateOrderRequest,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    """
    Recreate an order based on an existing order ID.
    Validates that the order belongs to the current vendor and is auto_cancelled.
    Supports all order types: oneway, roundtrip, multicity, and hourly rental.
    """
    try:
        print("ORder is executing")
        result = recreate_order(db, payload.order_id, str(current_vendor.id), payload.max_time_to_assign_order)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to recreate order: {str(e)}",
        )