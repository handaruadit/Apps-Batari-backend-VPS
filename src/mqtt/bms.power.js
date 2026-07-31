const calculateBatteryPowerKw = (voltage, current) => {
  const voltageNumber = Number(voltage);
  const currentNumber = Number(current);

  if (!Number.isFinite(voltageNumber) || !Number.isFinite(currentNumber)) {
    return null;
  }

  const powerKw = (voltageNumber * currentNumber) / 1000;

  // Membatasi hingga 6 angka di belakang koma
  return Number(powerKw.toFixed(6));
};

module.exports = {
  calculateBatteryPowerKw,
};
