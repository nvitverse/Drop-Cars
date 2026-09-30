import enum


class DocumentStatusEnum(enum.Enum):
	PENDING = "PENDING"
	VERIFIED = "VERIFIED"
	INVALID = "INVALID"
	# A re-upload that STILL fails auto-verification (see
	# utils/document_verifier.py's get_auto_verified_status) - distinct from
	# a fresh first-time PENDING upload, which just means "not checked yet
	# / try again". NEEDS_REVIEW means the applicant already tried once
	# more and the automated check still isn't confident, so it should now
	# go to a human (Admin App's document review queue) instead of looping
	# the applicant through re-uploads forever.
	NEEDS_REVIEW = "NEEDS_REVIEW"


