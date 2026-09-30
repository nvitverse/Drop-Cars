-- Reviews table for customer testimonials
-- Run this in phpMyAdmin after schema.sql

CREATE TABLE IF NOT EXISTS reviews (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    rating TINYINT UNSIGNED NOT NULL DEFAULT 5,
    comment TEXT NOT NULL,
    trip_route VARCHAR(255) DEFAULT NULL,
    is_verified TINYINT(1) DEFAULT 1,
    is_approved TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_approved (is_approved),
    INDEX idx_created (created_at)
);

-- Optional: Run the following to seed initial reviews (run once only)
-- INSERT INTO reviews (customer_name, customer_phone, rating, comment, trip_route, is_verified, is_approved) VALUES
-- ('Rajesh Kumar', '9876543210', 5, 'Excellent one-way drop taxi! The driver was professional and the Sedan was clean. Perfect for our Madurai to Rameshwaram trip. Got instant confirmation on WhatsApp.', 'Madurai to Rameshwaram', 1, 1),
-- ('Priya Sharma', '9876543211', 5, 'Drop Cars gave us transparent pricing with no hidden charges. Booked Chennai to Bangalore for a family trip. Highly recommended for intercity travel!', 'Chennai to Bangalore', 1, 1),
-- ('Venkatesh Iyer', '9876543212', 5, 'Booked through WhatsApp and got instant confirmation. Driver reached on time, car was comfortable. Best drop taxi service in Tamil Nadu.', 'Chennai to Pondicherry', 1, 1),
-- ('Lakshmi Menon', '9876543213', 5, 'Affordable one-way cab from Trichy to Madurai. No return fare charges—exactly what we needed. Clean Innova, courteous driver.', 'Trichy to Madurai', 1, 1),
-- ('Arun Patel', '9876543214', 5, 'Used Drop Cars for a multi-city trip. 24/7 support helped us change our pickup time. Professional service, well-maintained vehicles.', 'Coimbatore to Ooty', 1, 1),
-- ('Deepa Nair', '9876543215', 5, 'Best intercity taxi in South India! Clean cars, verified drivers, transparent fares. Will definitely book again for our next trip.', 'Madurai to Chennai', 1, 1);
