# ==========================================================
# SUPPLY CHAIN AI CHATBOT - ERROR FREE VERSION
# ==========================================================

import sqlite3
import pandas as pd
import random
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from datetime import datetime

# ==========================================================
# DATABASE SETUP
# ==========================================================

conn = sqlite3.connect("supply_chain.db")
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS suppliers(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    tier INTEGER,
    country TEXT,
    risk_score REAL DEFAULT 0
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS transactions(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER,
    amount REAL,
    delay INTEGER,
    mismatch INTEGER,
    timestamp TEXT,
    fraud INTEGER
)
""")

conn.commit()

# ==========================================================
# GENERATE TRAINING DATA
# ==========================================================

def generate_training_data():

    data = []

    for i in range(500):

        amount = random.randint(1000, 1000000)
        delay = random.randint(0, 30)
        mismatch = random.randint(0, 1)

        fraud = 0

        if amount > 300000 and delay > 10:
            fraud = 1

        if mismatch == 1 and amount > 200000:
            fraud = 1

        data.append([amount, delay, mismatch, fraud])

    df = pd.DataFrame(
        data,
        columns=["amount", "delay", "mismatch", "fraud"]
    )

    return df


#==========================================================
#AI MODEL CLASS
#==========================================================

class FraudDetectionAI:

    def __init__(self):

        self.scaler = StandardScaler()
        self.model = RandomForestClassifier(n_estimators=100)

        self.train()

    def train(self):

        df = generate_training_data()

        X = df[["amount", "delay", "mismatch"]]
        y = df["fraud"]

        self.scaler.fit(X)
        X_scaled = self.scaler.transform(X)

        self.model.fit(X_scaled, y)

    def predict(self, amount, delay, mismatch):

        X = [[amount, delay, mismatch]]

        X_scaled = self.scaler.transform(X)

        prediction = int(self.model.predict(X_scaled)[0])
        probability = float(self.model.predict_proba(X_scaled)[0][1])

        reasons = []

        if amount > 300000:
            reasons.append("High transaction amount")

        if delay > 10:
            reasons.append("Delivery delay is high")

        if mismatch == 1:
            reasons.append("Invoice mismatch")

        if probability > 0.7:
            reasons.append("Pattern matches fraud behaviour")

        return prediction, probability, reasons


# Initialize AI
ai = FraudDetectionAI()


# ==========================================================
# SUPPLIER FUNCTIONS
# ==========================================================

def add_supplier():

    name = input("Supplier Name: ")
    tier = int(input("Tier (1-3): "))
    country = input("Country: ")

    cursor.execute(
        "INSERT INTO suppliers(name,tier,country) VALUES(?,?,?)",
        (name, tier, country)
    )

    conn.commit()

    print("Supplier added successfully.")


# ==========================================================
# CALCULATE SUPPLIER RISK
# ==========================================================

def calculate_supplier_risk(supplier_id):

    cursor.execute(
        "SELECT fraud FROM transactions WHERE supplier_id=?",
        (supplier_id,)
    )

    rows = cursor.fetchall()

    if len(rows) == 0:
        return 0

    fraud_count = sum(row[0] for row in rows)
    total = len(rows)

    risk = fraud_count / total

    cursor.execute(
        "UPDATE suppliers SET risk_score=? WHERE id=?",
        (risk, supplier_id)
    )

    conn.commit()

    return risk


# ==========================================================
# ADD TRANSACTION
# ==========================================================

def add_transaction():

    supplier_id = int(input("Supplier ID: "))
    amount = float(input("Amount: "))
    delay = int(input("Delay days: "))
    mismatch = int(input("Invoice mismatch (0/1): "))

    prediction, probability, reasons = ai.predict(
        amount, delay, mismatch
    )

    cursor.execute("""
        INSERT INTO transactions
        (supplier_id, amount, delay, mismatch, timestamp, fraud)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        supplier_id,
        amount,
        delay,
        mismatch,
        str(datetime.now()),
        prediction
    ))

    conn.commit()

    supplier_risk = calculate_supplier_risk(supplier_id)

    print("\n=== FRAUD ANALYSIS ===")

    if prediction == 1:
        print("FRAUD DETECTED")
    else:
        print("SAFE TRANSACTION")

    print("Fraud Probability:", round(probability * 100, 2), "%")
    print("Supplier Risk:", round(supplier_risk * 100, 2), "%")

    print("Reasons:")
    for r in reasons:
        print("-", r)


# ==========================================================
# NETWORK ANALYSIS
# ==========================================================

def network_analysis():

    cursor.execute("""
        SELECT tier, AVG(risk_score)
        FROM suppliers
        GROUP BY tier
    """)

    rows = cursor.fetchall()

    print("\n=== NETWORK ANALYSIS ===")

    if len(rows) == 0:
        print("No suppliers found.")
        return

    for tier, risk in rows:

        if risk is None:
            risk = 0

        print(
            "Tier", tier,
            "Risk:", round(risk * 100, 2), "%"
        )


# ==========================================================
# CHATBOT
# ==========================================================

def chatbot():

    print("\nSUPPLY CHAIN AI CHATBOT STARTED")

    while True:

        print("\nCommands:")
        print("1. Add Supplier")
        print("2. Add Transaction")
        print("3. Check Risk")
        print("4. Network Analysis")
        print("5. Exit")

        choice = input("\nEnter command: ").lower()

        if choice == "add supplier":
            add_supplier()

        elif choice == "add transaction":
            add_transaction()

        elif choice == "check risk":

            supplier_id = int(input("Supplier ID: "))
            risk = calculate_supplier_risk(supplier_id)

            print("Supplier Risk:",
                  round(risk * 100, 2), "%")

        elif choice == "network analysis":
            network_analysis()

        elif choice == "exit":
            print("Goodbye")
            break

        else:
            print("Invalid command")

if __name__ == "__main__":
    chatbot()
