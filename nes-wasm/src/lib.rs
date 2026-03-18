extern crate wasm_bindgen;

pub mod register;
pub mod cpu;
pub mod ppu;
pub mod apu;
pub mod rom;
pub mod memory;
pub mod mapper;
pub mod button;
pub mod joypad;
pub mod input;
pub mod audio;
pub mod display;
pub mod default_input;
pub mod default_audio;
pub mod default_display;

use cpu::Cpu;
use rom::Rom;
use button::Button;
use input::Input;
use display::Display;
use audio::Audio;

pub struct Nes {
	cpu: Cpu
}

impl Nes {
	pub fn new(input: Box<dyn Input>, display: Box<dyn Display>,
		audio: Box<dyn Audio>) -> Self {
		Nes {
			cpu: Cpu::new(input, display, audio)
		}
	}

	pub fn set_rom(&mut self, rom: Rom) {
		self.cpu.set_rom(rom);
	}

	pub fn bootup(&mut self) {
		self.cpu.bootup();
	}

	pub fn reset(&mut self) {
		self.cpu.reset();
	}

	pub fn step(&mut self) {
		self.cpu.step();
	}

	pub fn step_frame(&mut self) {
		self.cpu.step_frame();
	}

	pub fn copy_pixels(&self, pixels: &mut [u8]) {
		self.cpu.get_ppu().get_display().copy_to_rgba_pixels(pixels);
	}

	pub fn copy_sample_buffer(&mut self, buffer: &mut [f32]) {
		self.cpu.get_mut_apu().get_mut_audio().copy_sample_buffer(buffer);
	}

	pub fn press_button(&mut self, button: Button) {
		self.cpu.get_mut_input().press(button);
	}

	pub fn release_button(&mut self, button: Button) {
		self.cpu.get_mut_input().release(button);
	}

	pub fn is_power_on(&self) -> bool {
		self.cpu.is_power_on()
	}
}

// ─── WASM bindings ───────────────────────────────────────────────────

use wasm_bindgen::prelude::*;
use default_input::DefaultInput;
use default_audio::DefaultAudio;
use default_display::DefaultDisplay;

const FRAMEBUFFER_SIZE: usize = 256 * 240 * 4; // RGBA

#[wasm_bindgen]
pub struct WasmNes {
	nes: Nes,
	framebuffer: Vec<u8>,
}

#[wasm_bindgen]
impl WasmNes {
	/// Creates a new WasmNes instance
	#[wasm_bindgen(constructor)]
	pub fn new() -> Self {
		let input = Box::new(DefaultInput::new());
		let display = Box::new(DefaultDisplay::new());
		let audio = Box::new(DefaultAudio::new());
		WasmNes {
			nes: Nes::new(input, display, audio),
			framebuffer: vec![0u8; FRAMEBUFFER_SIZE],
		}
	}

	/// Load a ROM from bytes
	pub fn load_rom(&mut self, data: &[u8]) {
		self.nes.set_rom(Rom::new(data.to_vec()));
		self.nes.bootup();
	}

	/// Reset the emulator
	pub fn reset(&mut self) {
		self.nes.reset();
	}

	/// Execute one full frame
	pub fn step_frame(&mut self) {
		self.nes.step_frame();
	}

	/// Get pointer to the RGBA framebuffer (256x240x4 bytes)
	pub fn framebuffer_ptr(&self) -> *const u8 {
		self.framebuffer.as_ptr()
	}

	/// Get framebuffer length
	pub fn framebuffer_len(&self) -> usize {
		FRAMEBUFFER_SIZE
	}

	/// Copy current PPU pixels into the internal RGBA framebuffer
	pub fn update_framebuffer(&mut self) {
		self.nes.copy_pixels(&mut self.framebuffer);
	}

	/// Press a joypad1 button by index:
	/// 0=A, 1=B, 2=Select, 3=Start, 4=Up, 5=Down, 6=Left, 7=Right
	pub fn press_button(&mut self, index: u8) {
		if let Some(btn) = index_to_button(index) {
			self.nes.press_button(btn);
		}
	}

	/// Release a joypad1 button by index
	pub fn release_button(&mut self, index: u8) {
		if let Some(btn) = index_to_button(index) {
			self.nes.release_button(btn);
		}
	}

	/// Set all 8 buttons at once from a bitmask
	/// bit0=A, bit1=B, bit2=Select, bit3=Start, bit4=Up, bit5=Down, bit6=Left, bit7=Right
	pub fn set_buttons(&mut self, mask: u8) {
		for i in 0..8u8 {
			if let Some(btn) = index_to_button(i) {
				if (mask >> i) & 1 == 1 {
					self.nes.press_button(btn);
				} else {
					self.nes.release_button(btn);
				}
			}
		}
	}
}

fn index_to_button(index: u8) -> Option<Button> {
	match index {
		0 => Some(Button::Joypad1A),
		1 => Some(Button::Joypad1B),
		2 => Some(Button::Select),
		3 => Some(Button::Start),
		4 => Some(Button::Joypad1Up),
		5 => Some(Button::Joypad1Down),
		6 => Some(Button::Joypad1Left),
		7 => Some(Button::Joypad1Right),
		_ => None,
	}
}
