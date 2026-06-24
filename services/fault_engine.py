def classify_fault(row, thresholds):

    if row["Vavg"] > thresholds["VHIGH"]:

        return "Voltage High"

    elif row["Vavg"] < thresholds["VLOW"]:

        return "Voltage Low"

    elif row["Iavg"] > thresholds["IHIGH"]:

        return "Current High"

    elif row["Iavg"] < thresholds["ILOW"]:

        return "Current Low"

    elif row["Iimbalance"] > 10:

        return "Current Imbalance"

    else:

        return "Unknown"