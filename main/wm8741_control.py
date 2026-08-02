import tkinter as tk
from tkinter import scrolledtext, messagebox
import socket
import threading

UDP_PORT = 8888
TCP_PORT = 8889
DISCOVER_MSG = b"ESP_WM8741_DISCOVER"
REPLY_PREFIX = b"ESP_WM8741_IP"

class WM8741GUI:
    def __init__(self, root):
        self.root = root
        self.root.title("WM8741 Control")
        self.device_ip = None
        self.tcp_sock = None

        self.create_widgets()
        self.discover_device()

    def create_widgets(self):
        # ---- Discovery ----
        f = tk.LabelFrame(self.root, text="Discovery", padx=5, pady=5)
        f.pack(fill="x", padx=5, pady=5)
        tk.Button(f, text="Discover", command=self.discover_device).pack(side="left")
        self.status = tk.Label(f, text="Not connected", fg="red")
        self.status.pack(side="left", padx=10)

        # ---- 主控制区域 ----
        f2 = tk.LabelFrame(self.root, text="Controls", padx=5, pady=5)
        f2.pack(fill="x", padx=5, pady=5)

        # 1. 音量滑动条
        tk.Label(f2, text="Volume (0~127)").grid(row=0, column=0, sticky="w")
        self.vol_scale = tk.Scale(f2, from_=0, to=127, orient=tk.HORIZONTAL,
                                  length=200, tickinterval=16, resolution=1)
        self.vol_scale.set(0)
        self.vol_scale.grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        self.vol_label = tk.Label(f2, text="0")
        self.vol_label.grid(row=0, column=2, padx=5)
        self.vol_scale.config(command=lambda v: self.vol_label.config(text=str(int(float(v)))))
        tk.Button(f2, text="Apply Volume", command=self.set_volume).grid(row=0, column=3, padx=5)

        # 2. 滤波器单选按钮
        tk.Label(f2, text="Filter Response").grid(row=1, column=0, sticky="w", pady=5)
        self.filter_var = tk.IntVar(value=1)
        filter_frame = tk.Frame(f2)
        filter_frame.grid(row=1, column=1, columnspan=3, sticky="w")
        for i in range(1, 6):
            rb = tk.Radiobutton(filter_frame, text=str(i), variable=self.filter_var,
                                value=i, command=self.set_filter)
            rb.pack(side="left", padx=3)

        # 3. Volume Ramp 复选框
        self.ramp_var = tk.IntVar(value=0)
        cb = tk.Checkbutton(f2, text="Enable Volume Ramp", variable=self.ramp_var,
                            command=self.toggle_ramp)
        cb.grid(row=2, column=0, columnspan=2, sticky="w", pady=5)

        # 4. Anti-Clipping 复选框
        self.anticlip_var = tk.IntVar(value=0)
        cb_ac = tk.Checkbutton(f2, text="Enable Anti-Clipping (2dB atten)",
                               variable=self.anticlip_var, command=self.toggle_anticlip)
        cb_ac.grid(row=3, column=0, columnspan=2, sticky="w", pady=5)

        # 5. Mute 复选框 和 Soft Reset 按钮
        self.mute_var = tk.IntVar(value=0)   # 默认未静音
        cb_mute = tk.Checkbutton(f2, text="Mute", variable=self.mute_var,
                                 command=self.toggle_mute)
        cb_mute.grid(row=4, column=0, sticky="w", pady=5)
        tk.Button(f2, text="Soft Reset", command=lambda: self.send_cmd("RESET")).grid(row=4, column=1, padx=5)

        # 6. 寄存器直接写入
        tk.Label(f2, text="Reg (hex):").grid(row=5, column=0, pady=5)
        self.reg_entry = tk.Entry(f2, width=6)
        self.reg_entry.grid(row=5, column=1)
        tk.Label(f2, text="Val (hex):").grid(row=5, column=2)
        self.val_entry = tk.Entry(f2, width=6)
        self.val_entry.grid(row=5, column=3)
        tk.Button(f2, text="Write Reg", command=self.write_reg).grid(row=5, column=4, padx=5)

        # ---- 输出日志区域 ----
        f3 = tk.LabelFrame(self.root, text="Response Log", padx=5, pady=5)
        f3.pack(fill="both", expand=True, padx=5, pady=5)
        self.output = scrolledtext.ScrolledText(f3, height=8, state='disabled')
        self.output.pack(fill="both", expand=True)

        f2.columnconfigure(1, weight=1)

    def log(self, msg):
        self.output.config(state='normal')
        self.output.insert(tk.END, msg + "\n")
        self.output.see(tk.END)
        self.output.config(state='disabled')

    def discover_device(self):
        self.status.config(text="Discovering...", fg="orange")
        threading.Thread(target=self._discover_thread, daemon=True).start()

    def _discover_thread(self):
        ip = self._udp_discover()
        if ip:
            self.device_ip = ip
            self.status.config(text=f"Connected to {ip}", fg="green")
            self.log(f"Discovered {ip}")
            try:
                self.tcp_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.tcp_sock.settimeout(3)
                self.tcp_sock.connect((ip, TCP_PORT))
                self.log("TCP connected")
            except Exception as e:
                self.log(f"TCP error: {e}")
                self.status.config(text="TCP failed", fg="red")
        else:
            self.status.config(text="No device found", fg="red")
            self.log("No response to discover")

    def _udp_discover(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.settimeout(2)
        try:
            sock.sendto(DISCOVER_MSG, ('<broadcast>', UDP_PORT))
            data, _ = sock.recvfrom(1024)
            if data.startswith(REPLY_PREFIX):
                parts = data.decode().split()
                if len(parts) == 2:
                    return parts[1]
        except socket.timeout:
            pass
        finally:
            sock.close()
        return None

    def send_cmd(self, cmd):
        if not self.tcp_sock:
            self.log("Not connected")
            return
        try:
            self.tcp_sock.send((cmd + "\n").encode())
            resp = self.tcp_sock.recv(1024).decode()
            self.log(f"> {cmd}")
            self.log(f"< {resp.strip()}")
        except Exception as e:
            self.log(f"Send error: {e}")
            self.tcp_sock = None
            self.status.config(text="Disconnected", fg="red")

    def set_volume(self):
        v = self.vol_scale.get()
        self.send_cmd(f"VOLUME {v}")

    def set_filter(self):
        f = self.filter_var.get()
        self.send_cmd(f"FILTER {f}")

    def toggle_ramp(self):
        if self.ramp_var.get() == 1:
            self.send_cmd("SET_REG 04 01")
        else:
            self.send_cmd("SET_REG 04 00")

    def toggle_anticlip(self):
        if self.anticlip_var.get() == 1:
            self.send_cmd("ANTICLIP 1")
        else:
            self.send_cmd("ANTICLIP 0")

    def toggle_mute(self):
        if self.mute_var.get() == 1:
            self.send_cmd("MUTE 1")
        else:
            self.send_cmd("MUTE 0")

    def write_reg(self):
        try:
            reg = int(self.reg_entry.get(), 16)
            val = int(self.val_entry.get(), 16)
            if 0 <= reg <= 0x7F and 0 <= val <= 0xFF:
                self.send_cmd(f"SET_REG {reg:02X} {val:02X}")
            else:
                messagebox.showerror("Error", "Reg 0x00-0x7F, Val 0x00-0xFF")
        except ValueError:
            messagebox.showerror("Error", "Hex required")

if __name__ == "__main__":
    root = tk.Tk()
    app = WM8741GUI(root)
    root.mainloop()