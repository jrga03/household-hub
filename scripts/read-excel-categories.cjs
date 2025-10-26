#!/usr/bin/env node

const XLSX = require('xlsx');
const path = require('path');

// Read the Excel file
const filePath = '/Users/jasonacido/Downloads/Savings_Expenses.xlsx';
const workbook = XLSX.readFile(filePath);

// Get the Constants sheet
const sheetName = 'Constants';
if (!workbook.SheetNames.includes(sheetName)) {
  console.error(`Sheet "${sheetName}" not found. Available sheets:`, workbook.SheetNames);
  process.exit(1);
}

const worksheet = workbook.Sheets[sheetName];

// Convert to JSON
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

// Print the data
console.log(JSON.stringify(data.slice(0, 50), null, 2));
