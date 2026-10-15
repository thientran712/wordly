# Ảnh theme widget — nguồn và giấy phép

Ảnh trong `mobile/ios/WordlyiOS/Resources/WidgetPhotos/` (theme ảnh của widget màn hình chính).
Tất cả lấy từ **Unsplash**, giấy phép **Unsplash License** (miễn phí, dùng thương mại, không bắt buộc ghi tên — https://unsplash.com/license). Không ảnh nào là Unsplash+.

**Kiểm tra ngày 15/10/2026**, hai vòng độc lập:
1. Mở trang từng ảnh, xác nhận dòng "Free to use under the Unsplash License", không phải Unsplash+; xem tag của ảnh.
2. Xem tận mắt ảnh gốc và đúng phần widget cắt (nhỏ 1:1, vừa 2,14:1): không mặt người, không logo/thương hiệu, không chữ đọc được, không nhân vật.

**Điều kiện của Unsplash License cần giữ:** không bán ảnh nguyên bản (app chỉ dùng làm nền widget, đã làm tối + có chữ đè); không gom ảnh để làm dịch vụ giống/cạnh tranh Unsplash. Ảnh NASA: không ngụ ý NASA xác nhận/ủng hộ app, không dùng logo NASA.

**Xử lý:** cắt giữa về tỉ lệ ngang (ảnh dọc lấy dải 3:2 giữa), thu về 1400 px (`.jpg`) + 360 px (`-thumb.jpg`), bỏ EXIF.

| Theme id | Tên trong app | Ảnh Unsplash | Tác giả |
|---|---|---|---|
| study-dark | Phòng tối lặng | https://unsplash.com/photos/ulftbH1sA0k | Clint Patterson (@cbpsc1) |
| study-plants | Bàn cây xanh | https://unsplash.com/photos/OCphbptqFag | Clay Banks (@claybanks) |
| study-garden | Cửa sổ vườn | https://unsplash.com/photos/eNDidEwl40g | Fabio Tura (@tfabb) |
| study-lamp | Góc đèn bàn | https://unsplash.com/photos/t1kGWtSXj3c | Annie Spratt (@anniespratt) |
| study-bright | Bàn sáng mai | https://unsplash.com/photos/rcJcJ9urV7c | Dhony Koswara (@dhony24) |
| nature-pine | Rừng sương | https://unsplash.com/photos/OYFHT4X5isg | Dan Otis (@danotis) |
| nature-leaves | Lá đọng mưa | https://unsplash.com/photos/zFwalZoyoBA | Imam Fadly (@haiiimam) |
| nature-field | Đồng hoa nắng | https://unsplash.com/photos/G7Y_TibsGUM | Tim Mossholder (@timmossholder) |
| nature-lake | Hồ mây | https://unsplash.com/photos/j5qa7VyYlmc | Anna (@anna_c_wilhelm) |
| nature-flowers | Sườn núi hoa tím | https://unsplash.com/photos/16ad4kSOBuw | Hans Ott (@hansott) |
| city-bridge | Cầu mưa đêm | https://unsplash.com/photos/EvUKizMRjsg | Bruno Aguirre (@elcuervo) |
| city-lake | Phố bên hồ | https://unsplash.com/photos/NYiCtkXOOK8 | Gennady Zakharin (@gennady107) |
| city-bokeh | Ánh đèn nhoè | https://unsplash.com/photos/AQpOwYbm_Jg | gebhartyler (@gebhartyler) |
| city-blue | Đốm sáng xanh | https://unsplash.com/photos/klC63fPlcak | Moritz Kindler (@moritz_photography) |
| city-rain | Giọt mưa phố | https://unsplash.com/photos/_uDfd0eeOik | Andréas BRUN (@andreasbrun) |
| hero-storm | Sấm sét | https://unsplash.com/photos/WwY27RD0-Ag | Gavin Poh (@besubmerged) |
| hero-bolt | Tia chớp | https://unsplash.com/photos/vmvlzJz1lHg | Sean McAuliffe (@smcauliffe) |
| hero-towers | Tháp cao | https://unsplash.com/photos/1iNPK-TgM7g | Ronan Furuta (@ronan18) |
| hero-sunset | Mặt trời rực | https://unsplash.com/photos/okpCeADt2rE | Sanjeev Shakya (@sanjeev_shakya) |
| hero-dust | Bão cam | https://unsplash.com/photos/vt7LZoR6OWE | Matt Palmer (@mattpalmer) |
| space-milkyway | Dải Ngân Hà | https://unsplash.com/photos/wH2AzO3EBlI | NASA Hubble Space Telescope (@hubblespacetelescope) — tranh minh hoạ, credit "NASA, ESA, and Z. Levay (STScI/AURA)" |
| space-stars | Trời sao | https://unsplash.com/photos/DdYliO83hkY | Jake Weirick (@weirick) |
| space-galaxy | Thiên hà xoắn | https://unsplash.com/photos/3yQY9GPM8Mg | Javier Miranda (@nuvaproductions) |
| space-nebula | Tinh vân đỏ | https://unsplash.com/photos/I96EK3CbE6Y | wallace Henry (@ghostdogg187) |
| space-earth | Địa cầu | https://unsplash.com/photos/CbFEPur-EY0 | NASA (@nasa) — "Image Credit: NASA" |
| lux-sunsetvilla | Biệt thự hoàng hôn | https://unsplash.com/photos/so3wgJLwDxo | Roberto Nickson (@rpnickson) |
| lux-nightvilla | Biệt thự đêm | https://unsplash.com/photos/4bW1uBe4KJc | sidath vimukthi (@sidathkc) — trang gắn địa điểm là một villa tư nhân; ảnh không có biển tên/logo đọc được |
| lux-living | Phòng khách sang | https://unsplash.com/photos/Ez7fz5mavj0 | Aalo Lens (@aalolens) — ảnh dựng 3D |
| lux-trails | Vệt đèn cao tốc | https://unsplash.com/photos/dPgPoiUIiXk | Robin Pierre (@robinpierre) |
| lux-terrace | Sân thượng hoàng hôn | https://unsplash.com/photos/iqGUN6GIl78 | Aalo Lens (@aalolens) — ảnh dựng 3D |

**Đã loại khi review** (ghi lại để không chọn lại): ảnh vô lăng 3YfNCC1cnkk (tag "bmw", bảng đồng hồ nhận ra được hãng); ảnh có chữ/biển hiệu (_TPTXZd9mOo "SALE", Sz0kMDeDUc0 biển tốc độ + watermark, lrRaEBnR79Y sách "RUBENS"); ảnh có logo laptop/điện thoại hoặc màn hình đọc được; ảnh đèn/đồng hồ xe nhận ra hãng (UrJDpWnwEj0, EkM9QLD5OdY, ifC-l1kPLCs tag Ford Mustang); Kxf_j2LW4KE (có toà Empire State); ảnh có người (hnFmQgrmLt4).

**Không dùng:** nhân vật Marvel/DC/hoạt hình có bản quyền — không có nguồn miễn phí hợp pháp, vi phạm App Store 5.2.1.
