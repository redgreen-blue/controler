idf_component_register(SRCS "i2c_basic_example_main.c"
                            "wm8741_commands.c"
                            "ble_gatt_server.c"
                       INCLUDE_DIRS "."
                       REQUIRES bt nvs_flash esp_driver_i2c)
