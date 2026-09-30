"""
Unit tests for active-trip check logic (T2).
Verifies that a driver or car is identified as 'on a trip' if and only if
they have an OrderAssignment with status NOT in (CANCELLED, COMPLETED).
"""
import uuid
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database.session import Base
from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
from app.models.car_driver import CarDriver
from app.api.routes.fleet_swap import has_active_trip_driver, has_active_trip_car


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    OrderAssignment.__table__.create(bind=engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_driver_without_assignments_not_on_trip(db_session):
    driver_id = uuid.uuid4()
    assert has_active_trip_driver(db_session, driver_id) is False


def test_driver_with_completed_and_cancelled_assignments_not_on_trip(db_session):
    driver_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    
    a1 = OrderAssignment(
        order_id=101,
        vehicle_owner_id=owner_id,
        driver_id=driver_id,
        assignment_status=AssignmentStatusEnum.COMPLETED
    )
    a2 = OrderAssignment(
        order_id=102,
        vehicle_owner_id=owner_id,
        driver_id=driver_id,
        assignment_status=AssignmentStatusEnum.CANCELLED
    )
    db_session.add_all([a1, a2])
    db_session.commit()

    assert has_active_trip_driver(db_session, driver_id) is False


@pytest.mark.parametrize("active_status", [
    AssignmentStatusEnum.PENDING,
    AssignmentStatusEnum.ASSIGNED,
    AssignmentStatusEnum.DRIVING,
])
def test_driver_with_active_assignment_is_on_trip(db_session, active_status):
    driver_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    
    a = OrderAssignment(
        order_id=201,
        vehicle_owner_id=owner_id,
        driver_id=driver_id,
        assignment_status=active_status
    )
    db_session.add(a)
    db_session.commit()

    assert has_active_trip_driver(db_session, driver_id) is True
