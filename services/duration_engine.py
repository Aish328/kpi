def calculate_duration(mask):

    groups = (
        mask != mask.shift()
    ).cumsum()

    durations = (
        mask.astype(int)
        .groupby(groups)
        .sum()
    )

    if len(durations) == 0:
        return 0

    return int(durations.max())