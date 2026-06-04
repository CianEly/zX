import csv
import sys
import math

def main():
    try:
        with open('input.csv', 'r') as f:
            reader = csv.DictReader(f)
            row = next(reader)
    except Exception as e:
        print(f"Error reading input: {e}")
        sys.exit(1)

    n = 10
    try:
        x = [float(row[f'x{i}']) for i in range(1, n + 1)]
    except KeyError as e:
        print(f"Missing variable: {e}")
        sys.exit(1)

    f1 = x[0]
    g = 1.0 + 9.0 * sum(x[1:]) / (n - 1)
    # Prevent math domain error if f1/g is slightly negative due to float precision
    val = max(0.0, f1 / g)
    f2 = g * (1.0 - math.sqrt(val))

    with open('output.csv', 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['f1', 'f2'])
        writer.writeheader()
        writer.writerow({'f1': f1, 'f2': f2})

if __name__ == "__main__":
    main()
