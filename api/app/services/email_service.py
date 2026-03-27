import logging
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from app.config import get_settings

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        settings = get_settings()
        self.ses = boto3.client(
            "ses",
            region_name=settings.AWS_SES_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        self.from_email = f"{settings.SES_FROM_NAME} <{settings.SES_FROM_EMAIL}>"
        self.from_address = settings.SES_FROM_EMAIL

    def _send(self, to_email: str, subject: str, html_body: str, text_body: str) -> bool:
        try:
            self.ses.send_email(
                Source=self.from_email,
                Destination={"ToAddresses": [to_email]},
                Message={
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": {
                        "Html": {"Data": html_body, "Charset": "UTF-8"},
                        "Text": {"Data": text_body, "Charset": "UTF-8"},
                    },
                },
            )
            return True
        except ClientError as e:
            logger.error("SES send failed to %s: %s", to_email, e.response["Error"]["Message"])
            return False
        except Exception as e:
            logger.error("Email service unexpected error to %s: %s", to_email, str(e))
            return False

    def _base_html(self, title: str, content: str) -> str:
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body {{ font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; }}
    .container {{ max-width: 600px; margin: 40px auto; background: #ffffff;
                  border-radius: 12px; overflow: hidden;
                  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07); }}
    .header {{ background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
               padding: 32px 40px; }}
    .header h1 {{ color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }}
    .header p {{ color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 14px; }}
    .body {{ padding: 40px; }}
    .body p {{ line-height: 1.7; color: #475569; margin: 0 0 16px; }}
    .code-box {{ background: #f1f5f9; border: 2px solid #e2e8f0; border-radius: 8px;
                 padding: 20px; text-align: center; margin: 24px 0; }}
    .code-box span {{ font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #4f46e5; }}
    .btn {{ display: inline-block; background: #4f46e5; color: #ffffff !important;
            padding: 14px 32px; border-radius: 8px; text-decoration: none;
            font-weight: 600; font-size: 15px; margin: 16px 0; }}
    .footer {{ padding: 24px 40px; background: #f8fafc; border-top: 1px solid #e2e8f0; }}
    .footer p {{ font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.6; }}
    .highlight {{ color: #4f46e5; font-weight: 600; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Gator</h1>
      <p>AI-powered workforce management</p>
    </div>
    <div class="body">
      {content}
    </div>
    <div class="footer">
      <p>This email was sent by Gator. If you didn't request this, you can safely ignore it.<br>
      &copy; 2024 Gator. All rights reserved.</p>
    </div>
  </div>
</body>
</html>"""

    def send_otp_email(self, to_email: str, otp_code: str, purpose: str = "login") -> bool:
        purpose_labels = {
            "login": "sign in",
            "invite": "accept your invitation",
            "password_reset": "reset your password",
        }
        action = purpose_labels.get(purpose, "verify your identity")
        subject = f"Your Gator verification code: {otp_code}"
        content = f"""
      <p>Hi there,</p>
      <p>Use the following verification code to {action}. This code expires in <span class="highlight">10 minutes</span>.</p>
      <div class="code-box"><span>{otp_code}</span></div>
      <p>If you didn't request this code, please ignore this email and your account will remain secure.</p>
      <p>For security, never share this code with anyone.</p>
"""
        text = f"Your Gator verification code is: {otp_code}\nThis code expires in 10 minutes."
        return self._send(to_email, subject, self._base_html("Verification Code", content), text)

    def send_welcome_email(self, to_email: str, first_name: str) -> bool:
        subject = f"Welcome to Gator, {first_name}!"
        content = f"""
      <p>Hi {first_name},</p>
      <p>Welcome to <span class="highlight">Gator</span> — your AI-powered platform for workforce management and award rule configuration.</p>
      <p>You're all set to get started. Log in to your account to explore your dashboard and configure your first award agreement.</p>
      <p>If you have any questions, our support team is here to help.</p>
"""
        text = f"Welcome to Gator, {first_name}! Your account has been created."
        return self._send(to_email, subject, self._base_html("Welcome to Gator", content), text)

    def send_invite_email(
        self,
        to_email: str,
        first_name: str,
        org_name: str,
        invite_link: str,
    ) -> bool:
        subject = f"You've been invited to join {org_name} on Gator"
        content = f"""
      <p>Hi {first_name},</p>
      <p>You've been invited to join <span class="highlight">{org_name}</span> on Gator.</p>
      <p>Click the button below to accept your invitation and set up your account:</p>
      <p style="text-align: center;">
        <a href="{invite_link}" class="btn">Accept Invitation</a>
      </p>
      <p>This invitation link will expire in 48 hours. If you didn't expect this invitation, you can safely ignore this email.</p>
"""
        text = (
            f"You've been invited to join {org_name} on Gator.\n"
            f"Accept your invitation: {invite_link}"
        )
        return self._send(to_email, subject, self._base_html("You're Invited", content), text)

    def send_prospect_notification_email(
        self,
        to_email: str,
        prospect_name: str,
        company: str,
        phone: str,
    ) -> bool:
        subject = f"New prospect call: {company}"
        content = f"""
      <p>A new prospect has completed an interview call via Gator.</p>
      <table style="width:100%; border-collapse:collapse; margin:16px 0;">
        <tr>
          <td style="padding:8px 0; color:#64748b; width:40%;">Name</td>
          <td style="padding:8px 0; font-weight:600;">{prospect_name}</td>
        </tr>
        <tr>
          <td style="padding:8px 0; color:#64748b;">Company</td>
          <td style="padding:8px 0; font-weight:600;">{company}</td>
        </tr>
        <tr>
          <td style="padding:8px 0; color:#64748b;">Phone</td>
          <td style="padding:8px 0; font-weight:600;">{phone}</td>
        </tr>
      </table>
      <p>Log in to the Gator admin dashboard to review the call transcript and provision their account.</p>
"""
        text = f"New prospect: {prospect_name} from {company} ({phone}). Review in Gator admin."
        return self._send(
            to_email,
            subject,
            self._base_html("New Prospect Call", content),
            text,
        )


_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
