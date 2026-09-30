export const sendSMS = async (message: string, phoneNumber: string) => {
  try {
    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': 'lftsOjvcYgRxoSHeXGad6IQirw5CEN39JMnTzLuky7qWBVUpPhlTIRJfsaFD2345hWQz6VbLcwkvBHM8',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'dlt',
        sender_id: '',
        message: message,
        variables_values: '',
        schedule_time: '',
        flash: 0,
        numbers: phoneNumber,
      }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('SMS sending failed:', error);
    throw error;
  }
};

export const formatDriverAcceptanceSMS = (driverName: string, carName: string, carRegistration: string) => {
  return `DropCars: Your driver ${driverName} (${carName} - ${carRegistration}) has accepted your booking.`;
};