// Prevents additional console window on Windows in release; nice to have for macOS too.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    jarvisdesktop_lib::run()
}
