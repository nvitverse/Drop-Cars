const RAW_CITIES: string[] = [
  'Acharapakkam', 'Ambur', 'Ambattur', 'Anjugramam', 'Annur', 'Anthiyur', 'Arakkonam', 'Arcot', 'Ariyalur', 'Avadi', 'Avudayarkoil',
  'Bangalore', 'Batlagundu', 'Bhavani', 'Bhuvanagiri',
  'Chengalpattu', 'Chennai', 'Chellampatti', 'Chidambaram', 'Chinnasalem', 'Coimbatore', 'Colachel', 'Cuddalore',
  'Devakottai', 'Dharapuram', 'Dharmapuri', 'Dindigul',
  'Erode',
  'Gandarvakkottai', 'Gingee', 'Gobichettipalayam',
  'Harur', 'Hosur', 'Hyderabad',
  'Jayankondam', 'Jolarpettai',
  'Kallakurichi', 'Kallikudi', 'Kallupatti', 'Kamuthi', 'Kancheepuram', 'Kanchipuram', 'Kanyakumari', 'Karaikudi', 'Karamadai', 'Karimangalam', 'Kariapatti', 'Katpadi', 'Kattumannarkoil', 'Kinathukadavu', 'Kochi', 'Kodaikanal', 'Kottur', 'Kovilpatti', 'Krishnagiri', 'Kumbakonam', 'Kumarapalayam', 'Kunnam', 'Kurinjipadi', 'Kuzhithurai',
  'Lalgudi',
  'Madurai', 'Madurantakam', 'Mallankinaru', 'Mamallapuram', 'Manachanallur', 'Manamadurai', 'Manapparai', 'Mannargudi', 'Mayiladuthurai', 'Melur', 'Mettupalayam', 'Mettur', 'Mohanur', 'Mudukulathur', 'Mylapore',
  'Nagalapuram', 'Nagercoil', 'Nagapattinam', 'Namakkal', 'Natham', 'Needamangalam', 'Nellikuppam', 'Neyveli', 'Nilakottai', 'Nilakkottai',
  'Oddanchatram', 'Ooty', 'Orathanadu',
  'Padmanabhapuram', 'Palacode', 'Palani', 'Pallavaram', 'Palwal', 'Panruti', 'Papanasam', 'Parangipettai', 'Paramakudi', 'Pattukkottai', 'Pennagaram', 'Perambalur', 'Peravurani', 'Pernampattu', 'Perundurai', 'Pollachi', 'Pondicherry', 'Puducherry', 'Poonamallee', 'Pudukkottai', 'Puliyankudi',
  'Rajapalayam', 'Ramanathapuram', 'Rameswaram', 'Ranipet', 'Rasipuram',
  'Salem', 'Sankarankovil', 'Sankarapuram', 'Sathyamangalam', 'Sedapatti', 'Sendamangalam', 'Sengottai', 'Sholingur', 'Sirkazhi', 'Sivaganga', 'Sivakasi', 'Sriperumbudur', 'Sulur', 'Swamimalai',
  'Tambaram', 'Tenkasi', 'Thanjavur', 'Thiagadurgam', 'Thiruthuraipoondi', 'Thirumangalam', 'Thiruppanandal', 'Thiruvaiyaru', 'Thiruvidaimarudur', 'Thoothukudi', 'Thuraiyur', 'Thuvakudi', 'Tindivanam', 'Tiruchirappalli', 'Tiruchengode', 'Tirukalukundram', 'Tirumangalam', 'Tirunelveli', 'Tirupattur', 'Tiruppur', 'Tiruvadanai', 'Tiruvallur', 'Tiruvannamalai', 'Trivandrum',
  'Udayarpalayam', 'Udhagamandalam', 'Udumalaipettai', 'Ulundurpettai', 'Usilampatti', 'Uthiramerur',
  'Vadalur', 'Vadipatti', 'Valparai', 'Vallam', 'Vaniyambadi', 'Varadarajanpettai', 'Vedasandur', 'Vedaranyam', 'Vellore', 'Veppur', 'Vikravandi', 'Villupuram', 'Virudhachalam',
  'Walajabad',
  'Yercaud'
];

export const MASTER_CITIES: string[] = Array.from(new Set(RAW_CITIES)).sort((a, b) => a.localeCompare(b));

